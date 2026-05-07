# LabMind — Product Requirements Document

**Version:** 1.0  
**Status:** Ready for Software Architecture  
**Target:** Cold email demo for Lila Sciences senior director  
**Next step:** Hand to software architecture agent for system design + implementation

---

## 1. Project Overview

LabMind is a full-stack AI agent dashboard for autonomous scientific experiment optimization, inspired by Lila Sciences' AI factory model. It demonstrates a human-in-the-loop agent workflow where an AI proposes experiment parameters, researchers review and optionally adjust, then approve the next batch.

**Research domain:** mRNA-LNP (lipid nanoparticle) delivery optimization — finding optimal parameters (pH, temperature, concentration, lipid ratio) to maximize transfection efficiency.

**Key differentiator from autoResearch-style loops:**
- Experiments run in parallel batches (20 per batch), not serially
- Each batch takes hours to days in a physical lab
- Human is always in the loop — agent proposes, researcher approves
- Goal is convergence: each batch narrows toward optimal parameters using Bayesian optimization around the top performer

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Python + FastAPI + LangChain |
| LLM | Claude API — `claude-sonnet-4-20250514` |
| Database | JSON files (no DB for MVP) |
| Deployment | Frontend → Vercel, Backend → Railway (always-on, no cold start) |
| Images | BBBC016 dataset (Broad Institute) — downloaded at setup, served from `/static/images/` |

---

## 3. State Machine

The system has one global state stored in `data/state.json`. The frontend polls `GET /api/status` every 4 seconds.

### Primary flow

```
RUNNING → COMPLETE → ANALYZING → PROPOSAL_READY → APPROVED → RUNNING
```

### Optional editing branch (from PROPOSAL_READY)

```
PROPOSAL_READY → [researcher chats with agent] → EDITING
    → [researcher sends constraint / clicks Regenerate] → REGENERATING
    → [agent generates new proposal with constraint] → PROPOSAL_READY
    → [loop zero or more times]
    → APPROVED → RUNNING
```

Editing is entirely optional. Researcher can approve directly from PROPOSAL_READY without any chat.

### State transition triggers

| Transition | Trigger |
|---|---|
| RUNNING → COMPLETE | `POST /api/simulate` (button click) |
| COMPLETE → ANALYZING | Automatic — BackgroundTask fires immediately |
| ANALYZING → PROPOSAL_READY | Automatic — agent completes tool loop + Claude generates analysis |
| PROPOSAL_READY → EDITING | Researcher sends a message containing a constraint in chat |
| EDITING → REGENERATING | Researcher clicks "Regenerate Proposal" button |
| REGENERATING → PROPOSAL_READY | Agent generates new proposal, Claude rewrites analysis text |
| PROPOSAL_READY → APPROVED | Researcher clicks "Approve Batch" button |
| APPROVED → RUNNING | Automatic — pending proposal written as new batch JSON |

### Simulate timing (demo UX)

The simulate endpoint fires a background task. The user watches state transitions live:

1. State stays RUNNING for ~2 seconds (simulates experiments completing)
2. → COMPLETE (instant)
3. → ANALYZING (agent runs 4 tool calls, ~3–5 seconds)
4. Claude generates analysis text (~3 seconds)
5. → PROPOSAL_READY

Total: ~10 seconds. All transitions visible via frontend polling.

---

## 4. Backend — Agent Architecture

### Pattern

Single LangChain ReAct agent + 4 tools. Lightweight, close to autoResearch pattern. Agent decides tool call order autonomously — not hardcoded.

### Model

`claude-sonnet-4-20250514` — no extended thinking. System prompt instructs the model to analyze batch data, identify patterns, then produce structured output (analysis text + proposed parameters).

### Tools

**Tool 1: `load_batch_results(batch_id: str)`**
- Reads `data/batches/batch_{id}.json`
- Returns all 20 experiment records with params and results

**Tool 2: `find_top_performer(results: list)`**
- Ranks experiments by `transfection_rate`
- Returns: top experiment, batch mean, batch std, improvement vs previous batch baseline

**Tool 3: `generate_next_batch(top_performer: dict, constraints: str)`**
- Implements Bayesian optimization using Latin Hypercube Sampling (numpy/scipy)
- Samples 20 new parameter combinations in a narrowed region around top_performer
- `constraints` is the raw string from researcher chat (e.g. "exclude concentrations above 0.3 mg/mL") — passed directly to Claude to interpret and enforce during sampling
- Returns: list of 20 new experiment dicts with proposed parameters
- Writes result to `data/proposals/pending.json`

**Tool 4: `get_comparison_images(top_performer: dict, baseline: dict)`**
- Returns two image URLs from `/static/images/`
- High transfection → BBBC016 positive stain images (blue-white glow)
- Low transfection → BBBC016 negative stain images (dim blue-purple)
- Mapping is pre-defined at setup — no dynamic image selection needed for MVP

### Conversation memory

- `ConversationBufferMemory` in-process — lost on server restart / page refresh
- Acceptable for MVP demo context
- Chat messages are written to `data/state.json` (`chat_history` array) for UI re-render on page load

### Regenerate flow (constraint handling)

1. Researcher types constraint in chat (e.g. "exclude pH above 7.0 due to cytotoxicity")
2. Backend detects constraint-like message → sets state = EDITING, appends to `chat_history`
3. Researcher clicks "Regenerate Proposal"
4. `POST /api/regenerate` fires → calls `generate_next_batch(top_performer, constraint_message)`
5. Agent regenerates 20 new experiments respecting constraint
6. Claude rewrites full analysis text incorporating constraint rationale
7. State → PROPOSAL_READY — new proposal shown to researcher
8. Researcher can approve or continue editing

Constraints are per-session only. Not persisted across batches. Each new batch starts fresh.

---

## 5. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/status` | Current state, batch id, proposal summary if PROPOSAL_READY. Polled every 4s. |
| GET | `/api/batch/{id}` | Full batch data — all 20 experiments with params + results |
| GET | `/api/batches` | All batch summaries for history page |
| POST | `/api/simulate` | Triggers full agent loop as BackgroundTask. Returns `{"status": "started"}` immediately. |
| POST | `/api/chat` | Body: `{"message": "..."}`. Agent responds. If message contains constraint, sets state=EDITING. |
| POST | `/api/approve` | Copies pending proposal → new batch JSON. Sets state APPROVED → RUNNING. |
| POST | `/api/regenerate` | Calls generate_next_batch with latest constraint. Sets REGENERATING → PROPOSAL_READY. |

CORS must allow Vercel frontend domain.

---

## 6. Data Layer — File Structure

```
backend/
├── data/
│   ├── batches/
│   │   ├── batch_B1.json        # pre-seeded mock, status: complete
│   │   ├── batch_B2.json        # pre-seeded mock, status: complete
│   │   └── batch_B3.json        # created on approve, initially empty
│   ├── proposals/
│   │   └── pending.json         # agent-generated proposal, overwritten on regenerate
│   └── state.json               # global state
├── static/
│   └── images/                  # BBBC016 images, downloaded at setup
│       ├── positive_1.png
│       ├── positive_2.png
│       ├── positive_3.png
│       ├── negative_1.png
│       ├── negative_2.png
│       └── negative_3.png
```

### state.json schema

```json
{
  "current_state": "PROPOSAL_READY",
  "current_batch_id": "B2",
  "pending_proposal_id": "B3",
  "chat_history": [
    {"role": "user", "content": "Can we exclude concentrations above 0.3?"},
    {"role": "agent", "content": "Understood. Regenerating with concentration capped at 0.28 mg/mL..."}
  ],
  "latest_analysis": "Batch B2 shows strong convergence around pH 6.7...",
  "latest_constraints": "exclude concentrations above 0.3 mg/mL"
}
```

### batch JSON schema

```json
{
  "batch_id": "B2",
  "description": "Refined around pH 6.6–7.0",
  "status": "complete",
  "experiments": [
    {
      "exp_id": "EXP-B2-05",
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

---

## 7. Frontend — Pages

### Page 1: Welcome (empty state)

Shown when no batch is running. Full-screen dark layout in Lila Sciences style.

- Headline — one line, e.g. "Autonomous experiment optimization"
- 2-line subtitle describing the system
- Single CTA button — "Begin Experiment Batch"
- No batch data shown

### Page 2: Agent Analysis (main interaction page)

Shown when state is ANALYZING, PROPOSAL_READY, EDITING, or REGENERATING.

Layout (top to bottom):
1. Status pill (live, showing current state with pulse dot)
2. Eyebrow label — current batch transition (e.g. "BATCH B2 → B3 PROPOSAL")
3. Metric cards row (4 cards): Total experiments / Best transfection % / Awaiting approval / Convergence improvement
4. Image comparison panel — side by side: optimal vs baseline fluorescence image
5. Agent analysis text (natural language, generated by Claude)
6. Parameter chips — optimal values highlighted in gold
7. Proposed B3 parameter ranges (shown as secondary chips)
8. Divider
9. Multi-turn chat interface (researcher ↔ agent)
10. Input box + Send button
11. Action row — "Approve Batch B3" + "Regenerate Proposal" buttons

### Page 3: History / Dashboard

- Each batch shown as a row
- Each row contains 20 colored cells: white = highest transfection, graduated gray = mid, dark = low
- Top performer params shown below each batch row
- Convergence trend line across batches

### Page 4: Experiments Table

- All experiments across all batches in a table
- Columns: exp_id, batch, pH, temperature, concentration, lipid_ratio, incubation, transfection_rate, cell_viability
- Sortable by transfection_rate
- Filter by batch

---

## 8. Design System

| Token | Value |
|---|---|
| Background | `#0a0a09` — near-black |
| Card background | `rgba(255,255,255,0.02)` with `0.5px solid rgba(255,255,255,0.07)` border |
| Accent (gold) | `#c8a96e` — used sparingly: active state pills, CTA borders, top performer chips |
| Primary text | `#ffffff` |
| Secondary text | `rgba(255,255,255,0.45)` |
| Muted text | `rgba(255,255,255,0.25)` |
| Label style | Uppercase, letter-spacing 0.14–0.18em, font-size 9–10px |
| Font weight | 300–400 only. No bold headings. Lila-style lightness. |
| Border radius | Sharp — 0 or 4px max. No large rounded corners. |
| Fluorescence: high | Blue-white glow — matches real positive BBBC016 stain |
| Fluorescence: low | Dim blue-purple — matches real negative BBBC016 stain |
| Reference | Lila Sciences website (lilasciences.com) for overall aesthetic |

### Background decoration

SVG arc-network background (fine golden curves, opacity 0.15–0.18) to be implemented as a static SVG file in a later polish pass. **Not in MVP scope** — placeholder flat background for now. Will be revisited when final image assets are confirmed.

---

## 9. MVP Scope

### In scope

- FastAPI backend with full state machine
- LangChain ReAct agent with 4 tools
- Bayesian optimization (Latin Hypercube Sampling via numpy/scipy) in `generate_next_batch`
- Claude API integration for analysis text + chat
- Constraint handling via raw message string passed to Claude
- Next.js frontend — all 4 pages
- Mock JSON data for B1, B2 (complete) + pending B3 proposal
- Deploy to Vercel + Railway

### Out of scope (MVP)

- Real database
- Real experiment polling (manual simulate trigger only)
- User authentication
- Multiple research projects
- WebSocket (polling is sufficient)
- Background SVG curve decoration (deferred to final polish pass)

---

## 10. Build Order

| Step | Task |
|---|---|
| 1 | Mock JSON data — batch_B1, batch_B2, state.json, pending proposal |
| 2 | FastAPI skeleton — all endpoints, state machine logic, BackgroundTasks |
| 3 | LangChain agent — 4 tools wired, ReAct loop, mock Claude responses |
| 4 | Claude API integration — analysis prompt, chat endpoint, constraint regeneration |
| 5 | Next.js frontend — design system, layout, all 4 pages |
| 6 | Wire frontend ↔ backend — polling loop, state-driven rendering, chat, approve/regenerate |
| 7 | Deploy Railway (backend) + Vercel (frontend), CORS, env vars, end-to-end test |
| 8 | Polish — copy, welcome page, empty states, loading skeletons |

---

*PRD finalized. Hand to software architecture agent to produce system design, file structure, and implementation plan before coding begins.*
