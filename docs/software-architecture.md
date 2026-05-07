# LabMind — Software Architecture

**Version:** 1.0  
**Status:** Ready for Implementation  
**Derived from:** PRD v1.0  
**Audience:** Implementation-level coding agents — this document is self-contained.

---

## 1. System Overview

LabMind is a full-stack AI agent dashboard built on a stateless JSON file store. The FastAPI backend (Python, hosted on Railway) owns all state, runs a LangChain ReAct agent loop against Claude, and exposes a REST API that the Next.js frontend (TypeScript, hosted on Vercel) polls every 4 seconds. There is no database — one `state.json` file holds the global machine state, and each batch's experiment records live in individual `batch_B{n}.json` files. When the researcher triggers a simulate event, the backend spawns a FastAPI `BackgroundTask` that drives the state machine from `RUNNING` through `COMPLETE → ANALYZING → PROPOSAL_READY` without any further client interaction. The agent loop uses four LangChain tools (data loading, ranking, Bayesian sampling, and image retrieval) before Claude generates the final analysis text and proposed batch. From `PROPOSAL_READY`, the researcher may chat with the agent to add constraints, trigger regeneration, and ultimately approve the next batch — at which point the pending proposal is committed to disk and the state resets to `RUNNING` for the next cycle.

---

## 2. Complete File and Folder Structure

```
LabMind/
├── backend/
│   ├── main.py                        # FastAPI app, all endpoints, CORS, background tasks
│   ├── agent.py                       # LangChain ReAct agent class, memory, invocation
│   ├── tools.py                       # 4 LangChain tool implementations
│   ├── state_manager.py               # state.json read/write helpers
│   ├── models.py                      # Pydantic request/response models
│   ├── requirements.txt
│   ├── .env.example
│   ├── Procfile                       # Railway: web: uvicorn main:app --host 0.0.0.0 --port $PORT
│   ├── runtime.txt                    # python-3.11.9
│   ├── data/
│   │   ├── state.json                 # global state — source of truth
│   │   ├── batches/
│   │   │   ├── batch_B1.json          # pre-seeded mock, status: complete
│   │   │   └── batch_B2.json          # pre-seeded mock, status: complete
│   │   └── proposals/
│   │       └── pending.json           # agent-generated, overwritten on regenerate
│   └── static/
│       └── images/
│           ├── positive_1.png
│           ├── positive_2.png
│           ├── positive_3.png
│           ├── negative_1.png
│           ├── negative_2.png
│           └── negative_3.png
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── next.config.ts
    ├── postcss.config.js
    ├── .env.local.example
    ├── public/
    │   └── favicon.ico
    └── src/
        ├── app/
        │   ├── layout.tsx             # Root layout, font import, global CSS
        │   ├── page.tsx               # Root page — state-driven render switcher
        │   ├── globals.css            # Tailwind directives + CSS custom properties
        │   ├── history/
        │   │   └── page.tsx           # Batch history / dashboard page
        │   └── experiments/
        │       └── page.tsx           # Experiments table page
        ├── components/
        │   ├── WelcomePage.tsx        # Empty state, Begin Experiment CTA
        │   ├── RunningView.tsx        # RUNNING / COMPLETE states — progress indicator
        │   ├── AgentAnalysis.tsx      # Main interaction page (ANALYZING → PROPOSAL_READY → EDITING → REGENERATING)
        │   ├── StatusPill.tsx         # Live status chip with pulse dot
        │   ├── MetricCards.tsx        # 4-card row: experiments / best rate / awaiting / convergence
        │   ├── ImageComparison.tsx    # Side-by-side fluorescence images
        │   ├── AnalysisText.tsx       # Claude-generated analysis prose
        │   ├── ParameterChips.tsx     # Optimal (gold) + proposed (muted) parameter chips
        │   ├── ChatInterface.tsx      # Multi-turn scrollable chat component
        │   ├── ActionRow.tsx          # "Approve Batch" + "Regenerate Proposal" buttons
        │   ├── BatchHistoryPage.tsx   # Batch rows with heatmap cells + trend line
        │   └── ExperimentsTable.tsx   # Sortable/filterable experiments table
        ├── hooks/
        │   ├── usePolling.ts          # setInterval polling hook — returns StatusResponse
        │   └── useChat.ts             # Chat send/receive state management hook
        ├── lib/
        │   ├── api.ts                 # Typed API client (all fetch calls)
        │   └── types.ts               # TypeScript interfaces matching backend schemas exactly
        └── styles/
            └── design-tokens.ts      # Design system constants (colors, spacing, typography)
```

---

## 3. Data Schemas

### 3.1 `state.json`

```json
{
  "current_state": "PROPOSAL_READY",
  "current_batch_id": "B2",
  "pending_proposal_id": "B3",
  "chat_history": [
    { "role": "user",  "content": "Can we exclude concentrations above 0.3?" },
    { "role": "agent", "content": "Understood. I'll cap concentration at 0.28 mg/mL in the regenerated proposal." }
  ],
  "latest_analysis": "Batch B2 shows strong convergence around pH 6.7 with a mean transfection rate of 0.79...",
  "latest_constraints": "exclude concentrations above 0.3 mg/mL",
  "image_urls": {
    "optimal":  "/static/images/positive_1.png",
    "baseline": "/static/images/negative_2.png"
  }
}
```

**Field types:**

| Field | Type | Nullable |
|---|---|---|
| `current_state` | `string` (enum — see below) | No |
| `current_batch_id` | `string` | Yes — `null` when state is `IDLE` |
| `pending_proposal_id` | `string` | Yes — `null` unless state is `PROPOSAL_READY`, `EDITING`, or `REGENERATING` |
| `chat_history` | `array<{role: string, content: string}>` | No (empty array when no chat) |
| `latest_analysis` | `string` | Yes — `null` until first `PROPOSAL_READY` |
| `latest_constraints` | `string` | Yes — `null` until researcher sends a constraint |
| `image_urls` | `{optimal: string, baseline: string}` | Yes — `null` until first `PROPOSAL_READY` |

**`current_state` enum — complete list:**

| Value | Meaning |
|---|---|
| `IDLE` | No batch running; welcome page shown |
| `RUNNING` | Current batch is in-progress (simulated) |
| `COMPLETE` | Batch complete; about to begin analysis |
| `ANALYZING` | LangChain agent is executing tool loop |
| `PROPOSAL_READY` | Agent has produced analysis text + proposed next batch |
| `EDITING` | Researcher sent a constraint in chat; proposal not yet regenerated |
| `REGENERATING` | Agent is regenerating proposal with researcher constraint |
| `APPROVED` | Researcher approved; writing new batch JSON to disk |

**Initial `state.json` (seeded with mock data):**

```json
{
  "current_state": "RUNNING",
  "current_batch_id": "B2",
  "pending_proposal_id": null,
  "chat_history": [],
  "latest_analysis": null,
  "latest_constraints": null,
  "image_urls": null
}
```

---

### 3.2 `data/batches/batch_B{n}.json`

```json
{
  "batch_id": "B2",
  "description": "Refined around pH 6.6–7.0, reduced concentration range",
  "status": "complete",
  "created_at": "2025-01-14T09:00:00Z",
  "experiments": [
    {
      "exp_id": "EXP-B2-01",
      "parameters": {
        "pH": 6.7,
        "temperature_c": 37,
        "concentration_mg_ml": 0.28,
        "lipid_ratio": "3:1",
        "incubation_hours": 4
      },
      "transfection_rate": 0.84,
      "cell_viability": 0.91,
      "is_top_performer": true
    }
  ]
}
```

**Field types:**

| Field | Type | Notes |
|---|---|---|
| `batch_id` | `string` | `"B1"`, `"B2"`, etc. |
| `description` | `string` | Human-readable summary |
| `status` | `"complete"` \| `"pending"` | `pending` for newly approved batches awaiting simulate |
| `created_at` | `string` (ISO 8601) | Set at time of file creation |
| `experiments` | `array<Experiment>` | Exactly 20 items for complete batches |
| `exp_id` | `string` | Format: `"EXP-B{n}-{nn}"` e.g. `"EXP-B2-05"` |
| `parameters.pH` | `number` | 2 decimal places, range [6.0, 8.0] |
| `parameters.temperature_c` | `integer` | Range [35, 42] |
| `parameters.concentration_mg_ml` | `number` | 3 decimal places, range [0.1, 0.5] |
| `parameters.lipid_ratio` | `string` | Discrete: `"2:1"`, `"3:1"`, or `"4:1"` |
| `parameters.incubation_hours` | `integer` | Range [2, 8] |
| `transfection_rate` | `number` | 0.0–1.0, 2 decimal places |
| `cell_viability` | `number` | 0.0–1.0, 2 decimal places |
| `is_top_performer` | `boolean` | Exactly one `true` per batch |

**Pre-seeded mock data summary:**

- `batch_B1.json`: 20 experiments, wide parameter sweep, best transfection ~0.64, description: `"Initial wide-parameter exploration"`
- `batch_B2.json`: 20 experiments, narrowed around B1 top performer, best transfection ~0.84, description: `"Refined around pH 6.6–7.0, reduced concentration range"`

---

### 3.3 `data/proposals/pending.json`

```json
{
  "proposal_id": "B3",
  "generated_at": "2025-01-15T14:22:00Z",
  "source_batch_id": "B2",
  "top_performer_id": "EXP-B2-01",
  "constraints_applied": null,
  "experiments": [
    {
      "exp_id": "EXP-B3-01",
      "parameters": {
        "pH": 6.72,
        "temperature_c": 37,
        "concentration_mg_ml": 0.261,
        "lipid_ratio": "3:1",
        "incubation_hours": 4
      }
    }
  ]
}
```

**Field types:**

| Field | Type | Nullable |
|---|---|---|
| `proposal_id` | `string` | No |
| `generated_at` | `string` (ISO 8601) | No |
| `source_batch_id` | `string` | No |
| `top_performer_id` | `string` | No |
| `constraints_applied` | `string` | Yes — `null` if no constraints |
| `experiments` | `array<ProposedExperiment>` | No — always 20 items |

Proposed experiments have only `exp_id` and `parameters` — no `transfection_rate` or `cell_viability` (those come from the actual lab run).

---

## 4. State Machine Implementation Spec

Each row: trigger → which function handles it → side effects.

### 4.1 IDLE → RUNNING

- **Trigger:** `POST /api/simulate` (researcher clicks "Begin Experiment Batch")
- **Handler:** `simulate_endpoint()` in `main.py`
- **Side effects:**
  1. `state_manager.set_state("RUNNING")`
  2. If `current_batch_id` is `null`, set `current_batch_id = "B1"` (first run) — otherwise keep existing
  3. Fire `BackgroundTask: run_agent_loop(batch_id=state["current_batch_id"])`
  4. Return `{"status": "started"}` immediately

### 4.2 RUNNING → COMPLETE

- **Trigger:** `await asyncio.sleep(2)` inside `run_agent_loop()` (simulated lab time)
- **Handler:** `run_agent_loop()` in `main.py`
- **Side effects:**
  1. `state_manager.set_state("COMPLETE")`
  2. Execution continues immediately to next transition

### 4.3 COMPLETE → ANALYZING

- **Trigger:** Automatic — immediately after COMPLETE inside `run_agent_loop()`
- **Handler:** `run_agent_loop()` calls `state_manager.set_state("ANALYZING")`
- **Side effects:**
  1. `state_manager.set_state("ANALYZING")`
  2. Calls `agent.run_analysis_loop(batch_id)`

### 4.4 ANALYZING → PROPOSAL_READY

- **Trigger:** `agent.run_analysis_loop()` completes (LangChain agent finishes tool loop + Claude generates analysis)
- **Handler:** `agent.run_analysis_loop()` in `agent.py`, result handled in `run_agent_loop()` in `main.py`
- **Side effects:**
  1. `pending_proposal_id` = next batch ID (current numeric + 1, e.g., `"B3"`)
  2. Writes `data/proposals/pending.json`
  3. `state_manager.update_state({"latest_analysis": analysis_text, "image_urls": image_urls, "pending_proposal_id": next_id})`
  4. `state_manager.set_state("PROPOSAL_READY")`

### 4.5 PROPOSAL_READY → EDITING

- **Trigger:** `POST /api/chat` where `is_constraint_message(message)` returns `True`
- **Handler:** `chat_endpoint()` in `main.py`
- **Side effects:**
  1. `state_manager.append_chat_message("user", message)`
  2. Call `agent.chat(message)` → get agent reply
  3. `state_manager.append_chat_message("agent", reply)`
  4. `state_manager.update_state({"latest_constraints": message})`
  5. `state_manager.set_state("EDITING")`

### 4.6 EDITING → REGENERATING

- **Trigger:** `POST /api/regenerate` (researcher clicks "Regenerate Proposal")
- **Handler:** `regenerate_endpoint()` in `main.py`
- **Side effects:**
  1. `state_manager.set_state("REGENERATING")`
  2. Fire `BackgroundTask: run_regeneration()`
  3. Return `{"status": "started"}` immediately

### 4.7 REGENERATING → PROPOSAL_READY

- **Trigger:** `run_regeneration()` background task completes
- **Handler:** `run_regeneration()` in `main.py`
- **Side effects:**
  1. Read `latest_constraints` from `state.json`
  2. Read top performer from `current_batch_id` batch file
  3. Call `tools.generate_next_batch_impl(top_performer, constraints, pending_proposal_id)` — returns 20 experiments
  4. Overwrite `data/proposals/pending.json`
  5. Call Claude directly (single Anthropic SDK call) to rewrite `latest_analysis` incorporating constraint rationale
  6. `state_manager.update_state({"latest_analysis": new_analysis, "generated_at": now})`
  7. `state_manager.set_state("PROPOSAL_READY")`

### 4.8 PROPOSAL_READY → APPROVED

- **Trigger:** `POST /api/approve` (researcher clicks "Approve Batch")
- **Handler:** `approve_endpoint()` in `main.py`
- **Side effects:**
  1. `state_manager.set_state("APPROVED")`
  2. Fire `BackgroundTask: finalize_approval()`
  3. Return `{"status": "approved"}` immediately

### 4.9 APPROVED → RUNNING

- **Trigger:** Automatic — `finalize_approval()` background task
- **Handler:** `finalize_approval()` in `main.py`
- **Side effects:**
  1. Read `data/proposals/pending.json`
  2. Construct new batch JSON: copy proposal experiments into `batch_B{n}.json` with `status: "pending"`, `created_at: now`
  3. Write `data/batches/batch_B{next_id}.json`
  4. `state_manager.update_state({"current_batch_id": next_id, "pending_proposal_id": null, "latest_constraints": null, "latest_analysis": null, "image_urls": null})`
  5. `state_manager.reset_chat()`
  6. `state_manager.set_state("RUNNING")`

**Note:** After APPROVED → RUNNING, the state remains RUNNING until the researcher clicks "Simulate Complete" again. The frontend shows a "Simulate Complete" button during RUNNING state.

---

## 5. Backend Module Breakdown

### 5.1 `main.py`

**Responsibility:** FastAPI application entrypoint. Defines all HTTP endpoints, mounts static files, configures CORS, and contains the three background task functions.

```python
# Imports
import asyncio
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import anthropic
from datetime import datetime, timezone

from state_manager import StateManager
from agent import LabMindAgent
from models import (
    ChatRequest, ChatResponse,
    StatusResponse, BatchResponse, BatchSummary,
    SimulateResponse, ApproveResponse, RegenerateResponse
)

# Module-level singletons
app = FastAPI(title="LabMind API")
state_manager = StateManager(data_dir="data")
agent = LabMindAgent()

# --- Endpoint functions ---

async def simulate_endpoint(background_tasks: BackgroundTasks) -> SimulateResponse:
    """POST /api/simulate"""

async def get_status() -> StatusResponse:
    """GET /api/status"""

async def get_batch(batch_id: str) -> BatchResponse:
    """GET /api/batch/{batch_id}"""

async def get_all_batches() -> list[BatchSummary]:
    """GET /api/batches"""

async def chat_endpoint(body: ChatRequest, background_tasks: BackgroundTasks) -> ChatResponse:
    """POST /api/chat"""

async def approve_endpoint(background_tasks: BackgroundTasks) -> ApproveResponse:
    """POST /api/approve"""

async def regenerate_endpoint(background_tasks: BackgroundTasks) -> RegenerateResponse:
    """POST /api/regenerate"""

async def health_check() -> dict:
    """GET /health — used by Railway health check"""

# --- Background task functions ---

async def run_agent_loop(batch_id: str) -> None:
    """Drives RUNNING → COMPLETE → ANALYZING → PROPOSAL_READY."""

async def run_regeneration() -> None:
    """Drives REGENERATING → PROPOSAL_READY."""

async def finalize_approval() -> None:
    """Drives APPROVED → RUNNING."""
```

**`is_constraint_message(message: str) -> bool`** — module-level helper function. Returns `True` if `message` (lowercased) contains any of: `"exclude"`, `"avoid"`, `"cap"`, `"limit"`, `"no more than"`, `"at most"`, `"at least"`, `"below"`, `"above"`, `"don't"`, `"must not"`, `"restrict"`, `"maximum"`, `"minimum"`, `"max"`, `"min"`.

**`_next_batch_id(current_id: str) -> str`** — module-level helper. Parses the numeric suffix and increments: `"B2"` → `"B3"`.

**`run_agent_loop` implementation:**
```python
async def run_agent_loop(batch_id: str) -> None:
    await asyncio.sleep(2)                          # simulate lab time
    state_manager.set_state("COMPLETE")
    state_manager.set_state("ANALYZING")
    result = await asyncio.to_thread(agent.run_analysis_loop, batch_id)
    next_id = _next_batch_id(batch_id)
    state_manager.update_state({
        "latest_analysis": result["analysis_text"],
        "image_urls": result["image_urls"],
        "pending_proposal_id": next_id,
    })
    state_manager.set_state("PROPOSAL_READY")
```

**`run_regeneration` implementation:**
```python
async def run_regeneration() -> None:
    s = state_manager.get_state()
    batch_id = s["current_batch_id"]
    constraints = s["latest_constraints"]
    pending_id = s["pending_proposal_id"]

    from tools import load_batch_results_impl, find_top_performer_impl, generate_next_batch_impl
    batch_data = load_batch_results_impl(batch_id)
    top_performer = find_top_performer_impl(batch_data["experiments"])["top_experiment"]
    experiments = generate_next_batch_impl(top_performer, constraints, pending_id)

    proposal = {
        "proposal_id": pending_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_batch_id": batch_id,
        "top_performer_id": top_performer["exp_id"],
        "constraints_applied": constraints,
        "experiments": experiments,
    }
    state_manager.write_proposal(proposal)

    new_analysis = _rewrite_analysis_with_constraints(s["latest_analysis"], constraints, top_performer)
    state_manager.update_state({"latest_analysis": new_analysis})
    state_manager.set_state("PROPOSAL_READY")
```

**`_rewrite_analysis_with_constraints(existing_analysis: str, constraints: str, top_performer: dict) -> str`** — synchronous function. Makes a single `anthropic.Anthropic().messages.create()` call asking Claude to rewrite the analysis incorporating the constraint rationale. Returns the rewritten analysis string.

---

### 5.2 `agent.py`

**Responsibility:** Instantiates and owns the LangChain ReAct agent. Provides two invocation methods: `run_analysis_loop` (full tool-driven analysis) and `chat` (conversational reply). See Section 6 for complete LangChain configuration.

```python
class LabMindAgent:
    def __init__(self) -> None:
        """
        Initializes: ChatAnthropic LLM, 4 LangChain Tools, ConversationBufferMemory,
        creates ReAct agent via create_react_agent(), wraps in AgentExecutor.
        """

    def run_analysis_loop(self, batch_id: str) -> dict:
        """
        Invokes the AgentExecutor with the analysis prompt.
        Returns: {"analysis_text": str, "image_urls": {"optimal": str, "baseline": str}}
        Raises: RuntimeError if agent fails to produce structured output after 3 retries.
        """

    def chat(self, message: str) -> str:
        """
        Invokes the AgentExecutor with the user message in conversational mode.
        Uses the same AgentExecutor (same memory) as run_analysis_loop.
        Returns: agent reply string.
        """

    def _parse_analysis_output(self, raw_output: str) -> dict:
        """
        Extracts JSON from agent final answer.
        Finds first '[{' or '{' and last '}' or '}]' and parses.
        Returns parsed dict with keys: analysis_text, image_urls.
        Raises: ValueError if JSON cannot be parsed.
        """
```

---

### 5.3 `tools.py`

**Responsibility:** Implements the 4 tool functions in two forms each: a pure Python implementation (`*_impl`) and a LangChain `Tool` wrapper that serializes/deserializes JSON strings.

```python
# Pure implementations

def load_batch_results_impl(batch_id: str) -> dict:
    """
    Reads data/batches/batch_{batch_id}.json.
    Returns the full batch dict (same schema as batch_B{n}.json).
    Raises: FileNotFoundError if batch file does not exist.
    """

def find_top_performer_impl(experiments: list[dict]) -> dict:
    """
    Ranks experiments by transfection_rate descending.
    Returns:
    {
        "top_experiment": <experiment dict>,
        "batch_mean": float,
        "batch_std": float,
        "top_transfection_rate": float
    }
    """

def generate_next_batch_impl(top_performer: dict, constraints: str | None, batch_id: str) -> list[dict]:
    """
    Generates 20 new parameter candidates using Latin Hypercube Sampling.
    If constraints is non-empty, calls Claude to filter/adjust candidates.
    Returns: list of 20 dicts with keys: exp_id, parameters.
    See Section 7 for full implementation spec.
    """

def get_comparison_images_impl(top_performer: dict, baseline_transfection_rate: float) -> dict:
    """
    Returns two image URL strings.
    top_performer transfection_rate >= 0.75 → positive_1.png
    top_performer transfection_rate 0.50–0.74 → positive_2.png
    top_performer transfection_rate < 0.50 → positive_3.png
    baseline (first batch mean) >= 0.50 → negative_1.png
    baseline 0.30–0.49 → negative_2.png
    baseline < 0.30 → negative_3.png
    Returns: {"optimal": "/static/images/positive_N.png", "baseline": "/static/images/negative_N.png"}
    """

# LangChain Tool wrappers — each takes a single string, returns a string

def _tool_load_batch_results(batch_id: str) -> str:
    """Calls load_batch_results_impl, returns JSON string of batch dict."""

def _tool_find_top_performer(results_json: str) -> str:
    """
    Input: JSON string of experiments list (the 'experiments' array from batch dict).
    Calls find_top_performer_impl, returns JSON string of result dict.
    """

def _tool_generate_next_batch(input_json: str) -> str:
    """
    Input: JSON string: {"top_performer": {...}, "constraints": "...", "batch_id": "B3"}
    Calls generate_next_batch_impl, writes pending.json, returns JSON string of 20 experiments.
    """

def _tool_get_comparison_images(input_json: str) -> str:
    """
    Input: JSON string: {"top_performer": {...}, "baseline_transfection_rate": 0.52}
    Returns JSON string: {"optimal": "...", "baseline": "..."}
    """

# LangChain Tool objects (used in agent.py)

LOAD_BATCH_TOOL = Tool(
    name="load_batch_results",
    description="Load experiment results for a batch. Input: the batch_id string (e.g. 'B2'). Returns all 20 experiment records with parameters and results.",
    func=_tool_load_batch_results,
)

FIND_TOP_PERFORMER_TOOL = Tool(
    name="find_top_performer",
    description="Identify the top-performing experiment in a batch. Input: JSON string of the experiments array from load_batch_results. Returns top experiment, batch mean, batch std, and top transfection rate.",
    func=_tool_find_top_performer,
)

GENERATE_NEXT_BATCH_TOOL = Tool(
    name="generate_next_batch",
    description="Generate 20 optimized parameter candidates for the next experiment batch using Bayesian optimization. Input: JSON with keys 'top_performer' (experiment dict), 'constraints' (researcher constraint string, empty string if none), 'batch_id' (next batch ID string). Returns 20 proposed experiments.",
    func=_tool_generate_next_batch,
)

GET_COMPARISON_IMAGES_TOOL = Tool(
    name="get_comparison_images",
    description="Get fluorescence microscopy image URLs for visualization. Input: JSON with keys 'top_performer' (experiment dict) and 'baseline_transfection_rate' (float, mean of first batch). Returns optimal and baseline image URLs.",
    func=_tool_get_comparison_images,
)
```

---

### 5.4 `state_manager.py`

**Responsibility:** All reads and writes to `state.json` and `proposals/pending.json`. Uses file locking (`threading.Lock`) to prevent race conditions.

```python
import json
import threading
from pathlib import Path
from datetime import datetime, timezone

class StateManager:
    def __init__(self, data_dir: str) -> None:
        """
        Sets self.data_dir = Path(data_dir).
        Initializes self._lock = threading.Lock().
        Creates directories if missing: data_dir/batches/, data_dir/proposals/.
        Creates state.json with IDLE defaults if it does not exist.
        """

    def get_state(self) -> dict:
        """Thread-safe read of state.json. Returns full state dict."""

    def set_state(self, new_state: str) -> None:
        """Thread-safe write of current_state field only. Validates against STATE_ENUM."""

    def update_state(self, updates: dict) -> None:
        """
        Thread-safe partial update. Merges updates dict into existing state.json.
        Does not touch fields not present in updates.
        """

    def append_chat_message(self, role: str, content: str) -> None:
        """
        Thread-safe append to chat_history array.
        role must be 'user' or 'agent'.
        """

    def reset_chat(self) -> None:
        """Thread-safe clear of chat_history array and latest_constraints."""

    def write_proposal(self, proposal: dict) -> None:
        """Writes proposals/pending.json (overwrites). Thread-safe."""

    def read_proposal(self) -> dict:
        """Reads proposals/pending.json. Raises FileNotFoundError if missing."""

    def read_batch(self, batch_id: str) -> dict:
        """Reads batches/batch_{batch_id}.json. Raises FileNotFoundError if missing."""

    def write_batch(self, batch_id: str, batch_data: dict) -> None:
        """Writes batches/batch_{batch_id}.json. Thread-safe."""

    def list_batch_ids(self) -> list[str]:
        """Returns sorted list of existing batch IDs, e.g. ['B1', 'B2']. Sorted by numeric suffix."""

STATE_ENUM = {
    "IDLE", "RUNNING", "COMPLETE", "ANALYZING",
    "PROPOSAL_READY", "EDITING", "REGENERATING", "APPROVED"
}
```

---

### 5.5 `models.py`

**Responsibility:** Pydantic v2 models for all request bodies and response bodies.

```python
from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    state_changed: bool
    new_state: str

class ImageUrls(BaseModel):
    optimal: str
    baseline: str

class ProposalSummary(BaseModel):
    experiment_count: int
    param_ranges: dict          # keys: pH, temperature_c, concentration_mg_ml, lipid_ratio, incubation_hours
                                # values: {"min": float, "max": float} or a string for discrete params
    image_urls: ImageUrls

class StatusResponse(BaseModel):
    current_state: str
    current_batch_id: Optional[str]
    pending_proposal_id: Optional[str]
    chat_history: list[dict]
    latest_analysis: Optional[str]
    latest_constraints: Optional[str]
    image_urls: Optional[ImageUrls]
    proposal_summary: Optional[ProposalSummary]  # only included when PROPOSAL_READY/EDITING/REGENERATING

class ExperimentParameters(BaseModel):
    pH: float
    temperature_c: int
    concentration_mg_ml: float
    lipid_ratio: str
    incubation_hours: int

class Experiment(BaseModel):
    exp_id: str
    parameters: ExperimentParameters
    transfection_rate: Optional[float]
    cell_viability: Optional[float]
    is_top_performer: Optional[bool]

class BatchResponse(BaseModel):
    batch_id: str
    description: str
    status: str
    created_at: str
    experiments: list[Experiment]

class BatchSummary(BaseModel):
    batch_id: str
    description: str
    status: str
    experiment_count: int
    best_transfection_rate: Optional[float]
    mean_transfection_rate: Optional[float]

class SimulateResponse(BaseModel):
    status: str   # always "started"

class ApproveResponse(BaseModel):
    status: str   # always "approved"

class RegenerateResponse(BaseModel):
    status: str   # always "started"
```

---

## 6. LangChain Agent Spec

### 6.1 Dependencies

```txt
# requirements.txt (relevant subset)
langchain==0.3.x
langchain-anthropic==0.3.x
langchain-core==0.3.x
anthropic==0.40.x
```

### 6.2 Agent Construction

```python
from langchain_anthropic import ChatAnthropic
from langchain.agents import create_react_agent, AgentExecutor
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage

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

        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
        )

        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        react_agent = create_react_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt,
        )

        self.executor = AgentExecutor(
            agent=react_agent,
            tools=self.tools,
            memory=self.memory,
            verbose=True,
            max_iterations=10,
            handle_parsing_errors=True,
            return_intermediate_steps=False,
        )
```

### 6.3 System Prompt (full text)

```
You are a scientific AI agent specializing in mRNA-LNP (lipid nanoparticle) experiment optimization.

Your role is to analyze completed experiment batch data and autonomously propose optimized parameters for the next batch. You operate as part of a human-in-the-loop system: you propose, a researcher reviews and approves.

RESEARCH DOMAIN:
The goal is to maximize transfection efficiency in mRNA-LNP delivery. The five parameters under optimization are: pH (6.0–8.0), temperature in Celsius (35–42), mRNA concentration in mg/mL (0.1–0.5), lipid ratio (2:1, 3:1, or 4:1), and incubation hours (2–8).

TOOLS AVAILABLE:
- load_batch_results: Loads all 20 experiment records for a batch
- find_top_performer: Identifies the best experiment and computes batch statistics
- generate_next_batch: Uses Bayesian optimization (Latin Hypercube Sampling) to generate 20 new parameter candidates centered around the top performer
- get_comparison_images: Returns fluorescence microscopy image URLs for visualization

ANALYSIS TASK:
When given a batch ID to analyze, you must:
1. Call load_batch_results with the batch ID
2. Call find_top_performer with the experiments array from step 1
3. Call generate_next_batch with the top performer, any researcher constraints (empty string if none), and the next batch ID
4. Call get_comparison_images with the top performer and the baseline transfection rate (first batch mean, or batch mean if only one batch exists)
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
When a researcher sends a message outside of the analysis loop, respond helpfully and concisely. If the researcher specifies a constraint (e.g. "exclude concentrations above 0.3 mg/mL"), acknowledge it clearly and confirm what you will do in the regenerated proposal. Keep chat responses under 3 sentences.
```

### 6.4 `run_analysis_loop` Invocation

```python
def run_analysis_loop(self, batch_id: str) -> dict:
    next_batch_id = _next_batch_id(batch_id)
    input_text = (
        f"Analyze completed batch {batch_id} and generate a proposal for batch {next_batch_id}. "
        f"No constraints from the researcher at this time."
    )
    result = self.executor.invoke({"input": input_text})
    return self._parse_analysis_output(result["output"])
```

### 6.5 `chat` Invocation

```python
def chat(self, message: str) -> str:
    result = self.executor.invoke({"input": message})
    return result["output"]
```

The same `AgentExecutor` instance (and thus the same `ConversationBufferMemory`) is used for both `run_analysis_loop` and `chat`. This means the chat messages are in continuity with the analysis — the agent remembers what batch it analyzed.

### 6.6 Memory Behavior

- `ConversationBufferMemory` is in-process. It is reset when the FastAPI process restarts or when a new batch cycle begins.
- Chat messages for UI persistence are separately written to `state.json` via `state_manager.append_chat_message()`. These two stores are write-only synchronized — the agent memory is not seeded from `state.json` on startup.
- This is acceptable for MVP demo context.

---

## 7. Bayesian Optimization Spec

**File:** `tools.py` — `generate_next_batch_impl()`

### 7.1 Parameter Space

```python
PARAM_BOUNDS = {
    "pH":                    (6.0,  8.0),
    "temperature_c":         (35.0, 42.0),
    "concentration_mg_ml":   (0.1,  0.5),
    "lipid_ratio_numeric":   (2.0,  4.0),   # mapped to string: 2→"2:1", 3→"3:1", 4→"4:1"
    "incubation_hours":      (2.0,  8.0),
}
PARAM_KEYS = ["pH", "temperature_c", "concentration_mg_ml", "lipid_ratio_numeric", "incubation_hours"]
N_CANDIDATES = 20
SAMPLING_RADIUS_FRACTION = 0.25  # sample within ±25% of global range, centered on top performer
```

### 7.2 Sampling Bounds Computation

```python
def _get_sampling_bounds(top_performer: dict) -> tuple[list[float], list[float]]:
    params = top_performer["parameters"]
    lr_numeric = float(params["lipid_ratio"].split(":")[0])
    center_values = {
        "pH":                   params["pH"],
        "temperature_c":        float(params["temperature_c"]),
        "concentration_mg_ml":  params["concentration_mg_ml"],
        "lipid_ratio_numeric":  lr_numeric,
        "incubation_hours":     float(params["incubation_hours"]),
    }
    l_bounds, u_bounds = [], []
    for key in PARAM_KEYS:
        global_lo, global_hi = PARAM_BOUNDS[key]
        global_range = global_hi - global_lo
        center = center_values[key]
        half_width = global_range * SAMPLING_RADIUS_FRACTION
        lo = max(global_lo, center - half_width)
        hi = min(global_hi, center + half_width)
        l_bounds.append(lo)
        u_bounds.append(hi)
    return l_bounds, u_bounds
```

### 7.3 Latin Hypercube Sampling

```python
import numpy as np
from scipy.stats import qmc

def generate_next_batch_impl(top_performer: dict, constraints: str | None, batch_id: str) -> list[dict]:
    l_bounds, u_bounds = _get_sampling_bounds(top_performer)

    # Seed from batch_id for reproducibility within a given proposal
    seed = sum(ord(c) for c in batch_id) % (2 ** 31)
    sampler = qmc.LatinHypercube(d=5, seed=seed)
    unit_sample = sampler.random(n=N_CANDIDATES)          # shape (20, 5), values in [0, 1]
    scaled = qmc.scale(unit_sample, l_bounds, u_bounds)   # shape (20, 5), values in [l, u]

    experiments = []
    for i, row in enumerate(scaled):
        ph        = round(float(row[0]), 2)
        temp      = int(round(float(row[1])))
        conc      = round(float(row[2]), 3)
        lr_int    = max(2, min(4, int(round(float(row[3])))))
        lr_str    = f"{lr_int}:1"
        hours     = int(round(float(row[4])))

        experiments.append({
            "exp_id": f"EXP-{batch_id}-{i + 1:02d}",
            "parameters": {
                "pH": ph,
                "temperature_c": temp,
                "concentration_mg_ml": conc,
                "lipid_ratio": lr_str,
                "incubation_hours": hours,
            }
        })

    if constraints and constraints.strip():
        experiments = _apply_constraints_via_claude(experiments, constraints)

    # Write to pending.json
    state_manager = StateManager(data_dir="data")
    proposal = {
        "proposal_id": batch_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_batch_id": _prev_batch_id(batch_id),
        "top_performer_id": top_performer["exp_id"],
        "constraints_applied": constraints or None,
        "experiments": experiments,
    }
    state_manager.write_proposal(proposal)

    return experiments
```

### 7.4 Constraint Application via Claude

```python
def _apply_constraints_via_claude(experiments: list[dict], constraints: str) -> list[dict]:
    """
    Sends the generated candidates + researcher constraint to Claude.
    Claude filters/adjusts parameter values that violate the constraint.
    Returns exactly len(experiments) experiments.
    """
    import anthropic, json as _json

    client = anthropic.Anthropic()
    prompt = f"""You are helping filter and adjust experiment parameters for an mRNA-LNP optimization study.

The researcher has specified the following constraint:
"{constraints}"

Here are {len(experiments)} proposed experiment parameter sets:
{_json.dumps(experiments, indent=2)}

Instructions:
- Return a JSON array of exactly {len(experiments)} experiments
- If a parameter violates the constraint, adjust it to the nearest valid value that satisfies the constraint
- Do not add or remove experiments — always return exactly {len(experiments)} items
- Preserve all exp_id values exactly as given
- Only modify parameter values that violate the constraint; leave compliant values unchanged
- Return ONLY valid JSON — no explanation, no markdown, no code blocks

Return format: [{{"exp_id": "...", "parameters": {{"pH": ..., "temperature_c": ..., "concentration_mg_ml": ..., "lipid_ratio": "...", "incubation_hours": ...}}}}, ...]"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    content = message.content[0].text.strip()
    start = content.find("[")
    end = content.rfind("]") + 1
    return _json.loads(content[start:end])
```

### 7.5 `proposal_summary` Computation

When building `GET /api/status` response and `current_state` is `PROPOSAL_READY`, `EDITING`, or `REGENERATING`, compute `proposal_summary` from `pending.json`:

```python
def _compute_proposal_summary(experiments: list[dict], image_urls: dict) -> dict:
    param_values = {k: [] for k in ["pH", "temperature_c", "concentration_mg_ml", "incubation_hours"]}
    lipid_ratios = []
    for exp in experiments:
        p = exp["parameters"]
        for k in param_values:
            param_values[k].append(p[k])
        lipid_ratios.append(p["lipid_ratio"])

    param_ranges = {
        k: {"min": round(min(v), 3), "max": round(max(v), 3)}
        for k, v in param_values.items()
    }
    # lipid_ratio: report most common value
    from collections import Counter
    param_ranges["lipid_ratio"] = Counter(lipid_ratios).most_common(1)[0][0]

    return {
        "experiment_count": len(experiments),
        "param_ranges": param_ranges,
        "image_urls": image_urls,
    }
```

---

## 8. API Contract

### 8.1 `GET /health`

**Response 200:**
```json
{"status": "ok"}
```

---

### 8.2 `GET /api/status`

**Response 200:**
```json
{
  "current_state": "PROPOSAL_READY",
  "current_batch_id": "B2",
  "pending_proposal_id": "B3",
  "chat_history": [
    {"role": "user", "content": "Can we exclude concentrations above 0.3?"},
    {"role": "agent", "content": "Understood. I'll cap concentration at 0.28 mg/mL."}
  ],
  "latest_analysis": "Batch B2 shows strong convergence...",
  "latest_constraints": "exclude concentrations above 0.3 mg/mL",
  "image_urls": {
    "optimal": "/static/images/positive_1.png",
    "baseline": "/static/images/negative_2.png"
  },
  "proposal_summary": {
    "experiment_count": 20,
    "param_ranges": {
      "pH": {"min": 6.55, "max": 6.88},
      "temperature_c": {"min": 36, "max": 38},
      "concentration_mg_ml": {"min": 0.241, "max": 0.318},
      "incubation_hours": {"min": 3, "max": 5},
      "lipid_ratio": "3:1"
    },
    "image_urls": {
      "optimal": "/static/images/positive_1.png",
      "baseline": "/static/images/negative_2.png"
    }
  }
}
```

`proposal_summary` is `null` unless `current_state` is one of: `PROPOSAL_READY`, `EDITING`, `REGENERATING`.

**State transitions triggered:** None.

---

### 8.3 `GET /api/batch/{batch_id}`

**Path param:** `batch_id: str` — e.g. `"B2"`

**Response 200:**
```json
{
  "batch_id": "B2",
  "description": "Refined around pH 6.6–7.0, reduced concentration range",
  "status": "complete",
  "created_at": "2025-01-14T09:00:00Z",
  "experiments": [
    {
      "exp_id": "EXP-B2-01",
      "parameters": {
        "pH": 6.7,
        "temperature_c": 37,
        "concentration_mg_ml": 0.28,
        "lipid_ratio": "3:1",
        "incubation_hours": 4
      },
      "transfection_rate": 0.84,
      "cell_viability": 0.91,
      "is_top_performer": true
    }
  ]
}
```

**Response 404:** `{"detail": "Batch B99 not found"}`

**State transitions triggered:** None.

---

### 8.4 `GET /api/batches`

**Response 200:**
```json
[
  {
    "batch_id": "B1",
    "description": "Initial wide-parameter exploration",
    "status": "complete",
    "experiment_count": 20,
    "best_transfection_rate": 0.64,
    "mean_transfection_rate": 0.47
  },
  {
    "batch_id": "B2",
    "description": "Refined around pH 6.6–7.0",
    "status": "complete",
    "experiment_count": 20,
    "best_transfection_rate": 0.84,
    "mean_transfection_rate": 0.71
  }
]
```

For batches with `status: "pending"`, `best_transfection_rate` and `mean_transfection_rate` are `null`.

**State transitions triggered:** None.

---

### 8.5 `POST /api/simulate`

**Request body:** None

**Response 200:**
```json
{"status": "started"}
```

**Response 409** (if state is not `IDLE` or `RUNNING`):
```json
{"detail": "Cannot simulate: current state is ANALYZING"}
```

**State transitions triggered:** IDLE/RUNNING → (background) → COMPLETE → ANALYZING → PROPOSAL_READY

---

### 8.6 `POST /api/chat`

**Request body:**
```json
{"message": "Can we exclude concentrations above 0.3 mg/mL?"}
```

**Response 200:**
```json
{
  "response": "Understood. I'll constrain concentration to a maximum of 0.28 mg/mL in the regenerated proposal. Click 'Regenerate Proposal' when ready.",
  "state_changed": true,
  "new_state": "EDITING"
}
```

When `is_constraint_message()` returns `False`:
```json
{
  "response": "The B2 top performer at pH 6.7 showed a 31% improvement over the B1 baseline.",
  "state_changed": false,
  "new_state": "PROPOSAL_READY"
}
```

**Response 409** (if state is not `PROPOSAL_READY`, `EDITING`):
```json
{"detail": "Chat is only available during PROPOSAL_READY or EDITING states"}
```

**State transitions triggered:** `PROPOSAL_READY → EDITING` (only when `is_constraint_message()` returns `True`)

---

### 8.7 `POST /api/approve`

**Request body:** None

**Response 200:**
```json
{"status": "approved"}
```

**Response 409** (if state is not `PROPOSAL_READY`):
```json
{"detail": "Cannot approve: current state is EDITING. Regenerate or continue to PROPOSAL_READY first."}
```

**State transitions triggered:** PROPOSAL_READY → APPROVED → (background) → RUNNING

---

### 8.8 `POST /api/regenerate`

**Request body:** None

**Response 200:**
```json
{"status": "started"}
```

**Response 409** (if state is not `EDITING` and not `PROPOSAL_READY`):
```json
{"detail": "Cannot regenerate: no constraints set. Send a constraint message first."}
```

**Response 409** (if `latest_constraints` is null):
```json
{"detail": "Cannot regenerate: no constraints set. Send a constraint message in chat first."}
```

**State transitions triggered:** EDITING/PROPOSAL_READY → REGENERATING → (background) → PROPOSAL_READY

---

## 9. Frontend Module Breakdown

### 9.1 TypeScript Types (`lib/types.ts`)

```typescript
export type SystemState =
  | 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ANALYZING'
  | 'PROPOSAL_READY' | 'EDITING' | 'REGENERATING' | 'APPROVED';

export interface ImageUrls {
  optimal: string;
  baseline: string;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export interface ParamRanges {
  pH: { min: number; max: number };
  temperature_c: { min: number; max: number };
  concentration_mg_ml: { min: number; max: number };
  incubation_hours: { min: number; max: number };
  lipid_ratio: string;
}

export interface ProposalSummary {
  experiment_count: number;
  param_ranges: ParamRanges;
  image_urls: ImageUrls;
}

export interface StatusResponse {
  current_state: SystemState;
  current_batch_id: string | null;
  pending_proposal_id: string | null;
  chat_history: ChatMessage[];
  latest_analysis: string | null;
  latest_constraints: string | null;
  image_urls: ImageUrls | null;
  proposal_summary: ProposalSummary | null;
}

export interface ExperimentParameters {
  pH: number;
  temperature_c: number;
  concentration_mg_ml: number;
  lipid_ratio: string;
  incubation_hours: number;
}

export interface Experiment {
  exp_id: string;
  parameters: ExperimentParameters;
  transfection_rate: number | null;
  cell_viability: number | null;
  is_top_performer: boolean | null;
}

export interface BatchResponse {
  batch_id: string;
  description: string;
  status: string;
  created_at: string;
  experiments: Experiment[];
}

export interface BatchSummary {
  batch_id: string;
  description: string;
  status: string;
  experiment_count: number;
  best_transfection_rate: number | null;
  mean_transfection_rate: number | null;
}
```

---

### 9.2 API Client (`lib/api.ts`)

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export const api = {
  getStatus: (): Promise<StatusResponse> =>
    fetch(`${BASE_URL}/api/status`).then(r => r.json()),

  getBatch: (batchId: string): Promise<BatchResponse> =>
    fetch(`${BASE_URL}/api/batch/${batchId}`).then(r => r.json()),

  getAllBatches: (): Promise<BatchSummary[]> =>
    fetch(`${BASE_URL}/api/batches`).then(r => r.json()),

  simulate: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/simulate`, { method: 'POST' }).then(r => r.json()),

  chat: (message: string): Promise<{ response: string; state_changed: boolean; new_state: string }> =>
    fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then(r => r.json()),

  approve: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/approve`, { method: 'POST' }).then(r => r.json()),

  regenerate: (): Promise<{ status: string }> =>
    fetch(`${BASE_URL}/api/regenerate`, { method: 'POST' }).then(r => r.json()),
};
```

---

### 9.3 `hooks/usePolling.ts`

```typescript
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';

export function usePolling(intervalMs: number = 4000): StatusResponse | null {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getStatus();
        setStatus(data);
      } catch {
        // Swallow network errors during polling — do not update state
      }
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs]);

  return status;
}
```

---

### 9.4 `hooks/useChat.ts`

```typescript
import { useState } from 'react';
import { api } from '@/lib/api';
import { ChatMessage } from '@/lib/types';

export function useChat(initialHistory: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string): Promise<void> => {
    if (!text.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    try {
      const res = await api.chat(text);
      setMessages(prev => [...prev, { role: 'agent', content: res.response }]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
```

---

### 9.5 `app/page.tsx` (Root Page)

Fetches status via `usePolling`. Renders the appropriate top-level component based on `current_state`. Does not fetch batch data — passes `status` as props to child components.

```typescript
'use client';
import { usePolling } from '@/hooks/usePolling';
import WelcomePage from '@/components/WelcomePage';
import RunningView from '@/components/RunningView';
import AgentAnalysis from '@/components/AgentAnalysis';

const ANALYSIS_STATES = ['ANALYZING', 'PROPOSAL_READY', 'EDITING', 'REGENERATING'];
const RUNNING_STATES = ['RUNNING', 'COMPLETE', 'APPROVED'];

export default function Home() {
  const status = usePolling(4000);

  if (!status || status.current_state === 'IDLE') {
    return <WelcomePage />;
  }
  if (RUNNING_STATES.includes(status.current_state)) {
    return <RunningView status={status} />;
  }
  if (ANALYSIS_STATES.includes(status.current_state)) {
    return <AgentAnalysis status={status} />;
  }
  return <WelcomePage />;
}
```

---

### 9.6 `components/WelcomePage.tsx`

**Data fetched:** None.

**Renders:**
- Full-screen dark layout (`bg-[#0a0a09]`)
- Uppercase eyebrow label: `"LABMIND"` in gold (`#c8a96e`)
- Headline: `"Autonomous experiment optimization"` (weight 300, large)
- 2-line subtitle describing the system
- CTA button: `"Begin Experiment Batch"` — calls `api.simulate()` on click

**User interactions:**
- Click "Begin Experiment Batch" → `api.simulate()` → no navigation needed; root page re-renders on next poll

---

### 9.7 `components/RunningView.tsx`

**Props:** `{ status: StatusResponse }`

**Renders:**
- Status pill showing `RUNNING` or `COMPLETE`
- Current batch ID
- Pulsing animation during RUNNING
- During RUNNING: "Simulate Complete" button → calls `api.simulate()`
- During COMPLETE: spinner, "Preparing analysis..."
- During APPROVED: spinner, "Writing batch data..."

**User interactions:**
- Click "Simulate Complete" → `api.simulate()`

---

### 9.8 `components/AgentAnalysis.tsx`

**Props:** `{ status: StatusResponse }`

**Renders (in order from top to bottom):**
1. `<StatusPill state={status.current_state} />`
2. Eyebrow: `"BATCH {current_batch_id} → {pending_proposal_id} PROPOSAL"` (uppercase, letter-spacing)
3. `<MetricCards status={status} />` — fetches `GET /api/batch/{current_batch_id}` internally
4. `<ImageComparison imageUrls={status.image_urls} />` — hidden while `image_urls` is null (ANALYZING state)
5. `<AnalysisText text={status.latest_analysis} isLoading={status.current_state === 'ANALYZING'} />`
6. `<ParameterChips batchId={status.current_batch_id} proposalSummary={status.proposal_summary} />`
7. Divider (`hr` with `opacity-[0.07]`)
8. `<ChatInterface history={status.chat_history} />` — disabled during ANALYZING/REGENERATING
9. `<ActionRow status={status} />`

**User interactions:**
- All interactions delegated to child components.

---

### 9.9 `components/MetricCards.tsx`

**Props:** `{ status: StatusResponse }`

**Data fetched:** `GET /api/batch/{status.current_batch_id}` on mount (not on every poll).

**Renders 4 cards:**
1. **Total Experiments** — `current_batch_id` experiment count (from fetched batch)
2. **Best Transfection** — top performer's `transfection_rate` formatted as `"84%"`
3. **Awaiting Approval** — `"1 batch"` when `pending_proposal_id` is non-null, else `"—"`
4. **Convergence** — percentage improvement of best rate vs previous batch best, e.g. `"+31%"`; computed as `(B2_best - B1_best) / B1_best * 100`; shown as `"—"` if only one batch exists

Each card: uppercase label (9px, letter-spacing 0.16em, `rgba(255,255,255,0.45)`), large numeric value (white, weight 300).

---

### 9.10 `components/ImageComparison.tsx`

**Props:** `{ imageUrls: ImageUrls | null }`

When `imageUrls` is null: renders two placeholder gray boxes with `"Analyzing..."` label.

When non-null: renders two image frames side by side.
- Left: optimal image with label `"OPTIMAL CONDITION"` in gold
- Right: baseline image with label `"BASELINE"` in muted white
- Images served from `${NEXT_PUBLIC_BACKEND_URL}/static/images/...`

---

### 9.11 `components/ChatInterface.tsx`

**Props:** `{ history: ChatMessage[] }`

**Uses:** `useChat(history)` hook.

**Renders:**
- Scrollable message list (max height `320px`, overflow-y auto)
- User messages right-aligned, agent messages left-aligned
- Agent messages: subtle left border in gold (`#c8a96e`), `rgba(255,255,255,0.02)` background
- Text input at bottom (disabled if `status.current_state` is `ANALYZING` or `REGENERATING`)
- Send button

**Auto-scrolls to bottom** on new message (`useEffect` on `messages.length`).

**User interactions:**
- Type message + press Enter or click Send → `sendMessage(text)`

---

### 9.12 `components/ActionRow.tsx`

**Props:** `{ status: StatusResponse }`

**Renders:**
- Left button: `"Approve Batch {pending_proposal_id}"` — gold border, enabled only when `current_state === 'PROPOSAL_READY'`
- Right button: `"Regenerate Proposal"` — muted border, enabled only when `current_state === 'PROPOSAL_READY' || 'EDITING'`, disabled when `latest_constraints` is null
- Loading spinner inside buttons when state transitions are in-flight

**User interactions:**
- Click Approve → `api.approve()`
- Click Regenerate → `api.regenerate()`

---

### 9.13 `app/history/page.tsx` (Batch History)

**Data fetched:** `GET /api/batches` on mount. `GET /api/batch/{id}` for each batch (parallel `Promise.all`).

**Renders:**
- Page title: `"EXPERIMENT HISTORY"` (uppercase, letter-spacing)
- For each batch (sorted B1 → Bn):
  - Batch label: `"BATCH B1"` + description
  - 20 colored cells in a row: white → graduated gray → dark based on `transfection_rate` (1.0 = `#ffffff`, 0.0 = `#1a1a1a`, linear interpolation)
  - Top performer params below the cells
- Convergence trend line: SVG line chart across batches showing `best_transfection_rate` per batch. X-axis = batch number, Y-axis = 0.0–1.0. Gold line (`#c8a96e`), no axes labels, just the line on dark background.

---

### 9.14 `app/experiments/page.tsx` (Experiments Table)

**Data fetched:** `GET /api/batches` then `GET /api/batch/{id}` for all complete batches. All experiments merged into a flat array.

**State:** `sortKey: keyof Experiment` (default: `"transfection_rate"`), `sortDir: 'asc' | 'desc'` (default: `'desc'`), `filterBatchId: string | null`.

**Renders:**
- Batch filter pills at top (one per batch + "All")
- Table with columns: `exp_id`, `batch`, `pH`, `temperature_c`, `concentration_mg_ml`, `lipid_ratio`, `incubation_hours`, `transfection_rate`, `cell_viability`
- Sortable columns: click header to sort. Arrow indicator on active sort column.
- Top performer row highlighted with gold left border.
- `transfection_rate` rendered as percentage bar (colored fill behind the number).

---

### 9.15 `styles/design-tokens.ts`

```typescript
export const colors = {
  background:         '#0a0a09',
  cardBackground:     'rgba(255, 255, 255, 0.02)',
  cardBorder:         'rgba(255, 255, 255, 0.07)',
  accent:             '#c8a96e',
  textPrimary:        '#ffffff',
  textSecondary:      'rgba(255, 255, 255, 0.45)',
  textMuted:          'rgba(255, 255, 255, 0.25)',
} as const;

export const typography = {
  labelSize:          '9px',
  labelLetterSpacing: '0.16em',
  labelWeight:        300,
  bodyWeight:         300,
} as const;

export const borderRadius = {
  card:               '4px',
  button:             '0px',
  pill:               '4px',
} as const;
```

---

## 10. Environment Variables

### Backend (`.env` / Railway)

| Variable | Description | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | `sk-ant-...` |
| `FRONTEND_URL` | Vercel frontend URL for CORS allow-list | `https://labmind.vercel.app` |
| `PORT` | Port for uvicorn (Railway sets this automatically) | `8000` |
| `DATA_DIR` | Path to data directory | `./data` |

### Frontend (`.env.local` / Vercel)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Railway backend URL (no trailing slash) | `https://labmind-api.up.railway.app` |

### `.env.example` (backend)

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
FRONTEND_URL=http://localhost:3000
PORT=8000
DATA_DIR=./data
```

### `.env.local.example` (frontend)

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## 11. Deployment Configuration

### 11.1 Backend — Railway

**`Procfile`:**
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

**`runtime.txt`:**
```
python-3.11.9
```

**Railway settings:**
- Service type: Web Service (always-on, no cold start — required for demo)
- Health check path: `/health`
- Health check timeout: 30s
- Root directory: `backend/`
- Environment variables: `ANTHROPIC_API_KEY`, `FRONTEND_URL`

**CORS configuration in `main.py`:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("FRONTEND_URL", "http://localhost:3000"),
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
```

**Static files mount:**
```python
app.mount("/static", StaticFiles(directory="static"), name="static")
```

### 11.2 Frontend — Vercel

**`next.config.ts`:**
```typescript
const nextConfig = {
  images: {
    domains: ['labmind-api.up.railway.app'],
  },
};
export default nextConfig;
```

**Vercel settings:**
- Framework preset: Next.js
- Root directory: `frontend/`
- Build command: `npm run build`
- Output directory: `.next`
- Environment variables: `NEXT_PUBLIC_BACKEND_URL` (set to Railway URL)

### 11.3 Local Development

Backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
# Runs on localhost:3000
```

---

## 12. Implementation Handoff Notes

### Agent 1: Data + State Layer

**Files to implement:** `state_manager.py`, `data/state.json`, `data/batches/batch_B1.json`, `data/batches/batch_B2.json`, `data/proposals/pending.json`

**Implement first:** `StateManager` class with all methods working and tested with real files.

**Must not deviate from:**
- The exact `state.json` schema (Section 3.1)
- The `STATE_ENUM` set (8 values, Section 3.1)
- The `batch_B{n}.json` schema (Section 3.2)
- File paths exactly as specified in Section 2

**Pre-seeded mock data requirements:**
- `batch_B1.json`: 20 experiments, wide spread (pH 6.0–8.0, temp 35–42, conc 0.1–0.5), best transfection ~0.64, exactly one `is_top_performer: true`
- `batch_B2.json`: 20 experiments, narrowed around B1 top performer, best transfection ~0.84, exactly one `is_top_performer: true`
- Initial `state.json`: `current_state: "RUNNING"`, `current_batch_id: "B2"`, all other fields null/empty

---

### Agent 2: Backend API + State Machine

**Files to implement:** `main.py`, `models.py`

**Implement first:** All endpoint stubs returning mock responses, then wire in `StateManager`, then implement background tasks.

**Must not deviate from:**
- The API contract (Section 8) — exact paths, HTTP methods, request/response schemas
- State transition rules (Section 4) — each endpoint must validate state before proceeding
- The 409 error responses — frontend depends on these for error display
- CORS configuration — `FRONTEND_URL` env var only, plus `localhost:3000` for dev

**Key implementation note:** All three background tasks (`run_agent_loop`, `run_regeneration`, `finalize_approval`) must use `asyncio.to_thread()` to call synchronous agent/tool code without blocking the event loop.

---

### Agent 3: Tools + Bayesian Optimization

**Files to implement:** `tools.py`

**Implement first:** `load_batch_results_impl` and `find_top_performer_impl` (pure Python, no external deps beyond stdlib). Then `generate_next_batch_impl` with LHS sampling. Then `get_comparison_images_impl`. Finally the LangChain `Tool` wrappers.

**Must not deviate from:**
- Tool names exactly as specified in Section 5.3 — agent.py references these by name
- `_tool_*` wrappers must accept and return plain strings (LangChain requirement)
- `generate_next_batch_impl` must write `pending.json` as a side effect (Section 7.3)
- Parameter bounds in `PARAM_BOUNDS` (Section 7.1)
- Lipid ratio must snap to discrete values {2, 3, 4} then format as `"N:1"` string

---

### Agent 4: LangChain Agent

**Files to implement:** `agent.py`

**Implement first:** `LabMindAgent.__init__()` with the full LangChain setup. Test that `run_analysis_loop("B2")` produces a dict with `analysis_text` and `image_urls` keys. Then test `chat()`.

**Must not deviate from:**
- Model: `claude-sonnet-4-20250514`
- Tool names registered in `self.tools` must match exactly: `load_batch_results`, `find_top_performer`, `generate_next_batch`, `get_comparison_images`
- System prompt (Section 6.3) — do not truncate or rephrase
- Final answer format: `{"analysis_text": "...", "image_urls": {"optimal": "...", "baseline": "..."}}`
- `_parse_analysis_output` must handle cases where Claude wraps JSON in markdown code fences

---

### Agent 5: Frontend

**Files to implement:** All files under `frontend/src/`

**Implement first:** `lib/types.ts` and `lib/api.ts`. Then `hooks/usePolling.ts`. Then `app/page.tsx` state routing. Then `WelcomePage.tsx` and `RunningView.tsx`. Then `AgentAnalysis.tsx` and its children. Then history and experiments pages last.

**Must not deviate from:**
- `StatusResponse` TypeScript interface (Section 9.1) — must match backend response exactly
- Polling interval: 4000ms
- `NEXT_PUBLIC_BACKEND_URL` env var — all `api.ts` calls must use it
- Design tokens (Section 9.15) — colors and typography must match the values exactly
- State routing logic in `app/page.tsx` (Section 9.5) — which states show which pages

**Testing requirement:** Start the dev server and verify state transitions are visible in the UI before reporting complete. The simulate → analyzing → proposal_ready flow must be visually observable.

---

*End of software-architecture.md. This document supersedes the PRD for implementation decisions. All downstream agents should implement against this document, not the PRD.*
