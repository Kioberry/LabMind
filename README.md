# LabMind

**Live Agent:** https://lab-mind.vercel.app/

**Demo Video:** https://youtu.be/_BhIjSgo9Jo 

![LabMind screenshot](docs/screenshot.png)

An AI agent dashboard for autonomous scientific experiment optimization. LabMind demonstrates a human-in-the-loop workflow where an AI proposes the next batch of laboratory experiments, researchers review and optionally adjust the proposal, and then approve it — creating a continuous optimization loop.

**Research domain:** mRNA-LNP (lipid nanoparticle) delivery optimization — finding the optimal combination of pH, temperature, mRNA concentration, lipid ratio, and incubation time to maximize transfection efficiency.

---

## What This Agent Does

LabMind runs a LangChain ReAct agent powered by Claude that closes the loop between experimental results and next-step decisions.

1. **Process experimental data**  
   The system starts by processing fluorescence microscopy TIF images from a batch of experiments. Using computer vision methods(Otsu thresholding and watershed segmentation), it measures transfection efficiency for each condition.

2. **Identify the best-performing result**  
   Once all experiments in the batch are analyzed, the agent compares outcomes and identifies the top-performing parameter combination.

3. **Generate the next experiment proposal**  
   The agent uses the result as the center point for Bayesian optimization, generating a new set of parameters for the next batch.

4. **Explain the outcome**  
   Alongside the proposal, the agent produces a structured scientific analysis that explains what drove the result and why the next range is worth exploring.

5. **Refine with human input**  
   Before moving forward, the researcher can set constraints in the chat interface. The agent incorporates these constraints, regenerates the parameter space, and updates both the proposal and the reasoning.

This system is designed for real laboratory settings where experiments run in parallel and each batch takes hours or days to complete. The agent handles the optimization loop, while the researcher remains in control of the final decision.

**Where to use it:** This serves as a starting point for lab workflows that require iterative optimization with human oversight, including drug formulation, cell culture condition screening, and other batch-based experimental systems.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS + Recharts |
| Backend | Python 3.11 + FastAPI + LangChain |
| LLM | Claude API (`claude-sonnet-4-20250514`) via Anthropic SDK |
| Agent framework | LangChain ReAct agent with `AgentExecutor` + `ConversationBufferMemory` |
| Optimization | Latin Hypercube Sampling (`scipy.stats.qmc`) |
| Image processing | `tifffile`, `scikit-image` (Otsu threshold, watershed), `Pillow` |
| Data store | JSON files (no database) |
| Deployment | Frontend → Vercel, Backend → Railway |
| Image dataset | BBBC016 (Broad Institute) — GFP fluorescence TIF files |

---

## How to Run

You need two terminals: one for the backend, one for the frontend.

### Prerequisites

- Python 3.11
- Node.js 18+
- An Anthropic API key

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
uvicorn main:app --reload --port 8000
```

The backend starts at `http://localhost:8000`. On first startup it resets any in-flight state to IDLE and clears processed image PNGs (they are regenerated on each run).

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# .env.local.example already points to localhost:8000 — no changes needed
npm run dev
```

The frontend starts at `http://localhost:3000`.

### Verify

Open `http://localhost:3000` to check the Welcome page.

---


## Project Structure

```
LabMind/
├── backend/
│   ├── main.py               # FastAPI app, all endpoints, CORS, background tasks
│   ├── agent.py              # LangChain ReAct agent, tool loop, chat
│   ├── tools.py              # 4 LangChain tools (load, rank, optimize, images)
│   ├── image_processing.py   # TIF reading, Otsu threshold, transfection rate computation
│   ├── state_manager.py      # state.json read/write with thread locking
│   ├── models.py             # Pydantic request/response models
│   ├── requirements.txt
│   ├── data/
│   │   ├── state.json        # global state machine state
│   │   ├── batches/          # batch_B1.json, batch_B2.json (pre-seeded), batch_B3+.json (generated)
│   │   └── proposals/        # pending.json (agent-generated, overwritten on regenerate)
│   └── static/images/        # BBBC016 TIF files + processed/ GFP PNGs (runtime-generated)
│
└── frontend/
    └── src/
        ├── app/              # Next.js routes: /, /history, /experiments, /analysis
        ├── components/       # WelcomePage, RunningView, AgentAnalysis, Sidebar, charts, etc.
        ├── hooks/            # usePolling (4s), useChat
        └── lib/              # api.ts (typed fetch client), types.ts
```

---

## References

- [BBBC016 Dataset](https://bbbc.broadinstitute.org/BBBC016) — Broad Bioimage Benchmark Collection, human U2OS cells, GFP transfection assay
- [Lila Sciences](https://lilasciences.com) — visual design reference and inspiration for the AI lab automation concept
- [Claude API](https://docs.anthropic.com) — Anthropic's API documentation
- [LangChain ReAct agents](https://python.langchain.com/docs/modules/agents/agent_types/react) — agent framework documentation
- [Latin Hypercube Sampling (scipy.stats.qmc)](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.qmc.LatinHypercube.html) — Bayesian optimization sampling method
- [FastAPI](https://fastapi.tiangolo.com) — Python backend framework
- [Next.js](https://nextjs.org/docs) — React frontend framework
- [Railway](https://railway.app) — backend deployment platform
- [Vercel](https://vercel.com) — frontend deployment platform
