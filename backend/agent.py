import json
import re
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning, module="langchain")

from langchain_anthropic import ChatAnthropic
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from tools import (
    LOAD_BATCH_TOOL,
    FIND_TOP_PERFORMER_TOOL,
    GENERATE_NEXT_BATCH_TOOL,
    GET_COMPARISON_IMAGES_TOOL,
)

SYSTEM_PROMPT = """You are a scientific AI agent specializing in mRNA-LNP (lipid nanoparticle) experiment optimization.

Your role is to analyze completed experiment batch data and autonomously propose optimized parameters for the next batch. You operate as part of a human-in-the-loop system: you propose, a researcher reviews and approves.

RESEARCH DOMAIN:
The goal is to maximize transfection efficiency in mRNA-LNP delivery. The five parameters under optimization are: pH (6.0–8.0), temperature in Celsius (35–42), mRNA concentration in mg/mL (0.1–0.5), lipid ratio (2:1, 3:1, or 4:1), and incubation hours (2–8).

TOOLS AVAILABLE:
- load_batch_results: Loads all 20 experiment records for a batch
- find_top_performer: Identifies the best experiment and computes batch statistics
- generate_next_batch: Uses Bayesian optimization (Latin Hypercube Sampling) to generate 20 new parameter candidates centered around the top performer
- get_comparison_images: Returns fluorescence microscopy image URLs. Input: JSON with keys 'top_exp_id' (the top experiment's exp_id string), 'batch_id' (current batch ID), 'baseline_exp_id' (the baseline_exp_id string returned by find_top_performer)

ANALYSIS TASK:
When given a batch ID to analyze, you must:
1. Call load_batch_results with the batch ID
2. Call find_top_performer with the experiments array from step 1
3. Call generate_next_batch with the top performer, any researcher constraints (empty string if none), and the next batch ID
4. Call get_comparison_images with the top experiment's exp_id (from step 2), the current batch_id, and the baseline_exp_id returned by find_top_performer (from step 2)
5. Produce your final answer as a JSON object

YOUR FINAL ANSWER FORMAT:
After completing all tool calls, respond with ONLY the following JSON — no additional text:
{"analysis_text": "<3-4 sentence scientific analysis>", "image_urls": {"optimal": "<url>", "baseline": "<url>"}}

ANALYSIS TEXT GUIDELINES:
- Write 3–4 sentences in scientific tone
- Sentence 1: What parameter combination drove the top performance in this batch
- Sentence 2: Statistical context (batch mean, std, improvement vs prior batch if available)
- Sentence 3: Why the proposed parameter range for the next batch is justified
- Sentence 4 (optional): Any caveat or confound worth noting
- Do not use bullet points. Prose only.

CHAT MODE:
When a researcher sends a message outside of the analysis loop, respond helpfully and concisely. If the researcher specifies a constraint (e.g. "exclude concentrations above 0.3 mg/mL"), acknowledge it clearly and confirm what you will do in the regenerated proposal. Keep chat responses under 3 sentences."""


def _next_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n + 1}"


class LabMindAgent:
    def __init__(self) -> None:
        self.llm = ChatAnthropic(
            model="claude-sonnet-4-20250514",
            temperature=0.3,
            max_tokens=4096,
        )

        self.tools = [
            LOAD_BATCH_TOOL,
            FIND_TOP_PERFORMER_TOOL,
            GENERATE_NEXT_BATCH_TOOL,
            GET_COMPARISON_IMAGES_TOOL,
        ]

        self._chat_history: list = []

        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        agent = create_tool_calling_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt,
        )

        self.executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=True,
            max_iterations=10,
            handle_parsing_errors=True,
            return_intermediate_steps=False,
        )

    def _invoke(self, input_text: str) -> dict:
        result = self.executor.invoke({
            "input": input_text,
            "chat_history": self._chat_history,
        })
        self._chat_history.append(HumanMessage(content=input_text))
        self._chat_history.append(AIMessage(content=self._extract_text(result["output"])))
        return result

    def _extract_text(self, output) -> str:
        if isinstance(output, str):
            return output
        if isinstance(output, list):
            parts = []
            for block in output:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block["text"])
                elif isinstance(block, str):
                    parts.append(block)
            return "".join(parts)
        return str(output)

    def _parse_analysis_output(self, raw_output) -> dict:
        raw_output = self._extract_text(raw_output)
        cleaned = re.sub(r'```(?:json)?\s*', '', raw_output).strip()
        cleaned = cleaned.replace('```', '').strip()
        start = cleaned.find('{')
        end = cleaned.rfind('}') + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON object found in agent output: {raw_output[:300]}")
        return json.loads(cleaned[start:end])

    def run_analysis_loop(self, batch_id: str) -> dict:
        next_id = _next_batch_id(batch_id)
        input_text = (
            f"Analyze completed batch {batch_id} and generate a proposal for batch {next_id}. "
            f"No constraints from the researcher at this time."
        )
        last_error = None
        for attempt in range(3):
            result = self._invoke(input_text)
            try:
                return self._parse_analysis_output(result["output"])
            except (ValueError, Exception) as e:
                last_error = e
                input_text = (
                    f"Your previous response could not be parsed as JSON. "
                    f"Please respond with ONLY the JSON object as specified in the system prompt. "
                    f"No extra text. Batch: {batch_id}, proposal: {next_id}."
                )
        raise RuntimeError(f"Agent failed to produce structured output after 3 attempts: {last_error}")

    def chat(self, message: str) -> str:
        result = self._invoke(message)
        return self._extract_text(result["output"])
