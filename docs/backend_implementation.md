# LabMind Backend Implementation Guide

**Source of truth:** `software-architecture.md`  
**Purpose:** Step-by-step build guide for the FastAPI backend. An engineer reading only this document and `software-architecture.md` should be able to build and deploy the backend without any other reference.

---

## 1. Exact Dependencies

**Python version:** 3.11.9 (matches `runtime.txt`)

**`backend/requirements.txt` — complete, pinned:**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
langchain==0.3.7
langchain-anthropic==0.3.1
langchain-core==0.3.21
anthropic==0.40.0
scipy==1.14.1
numpy==1.26.4
python-dotenv==1.0.1
aiofiles==24.1.0
pydantic==2.10.3
```

**Version rationale:**
- `fastapi==0.115.5` — latest stable 0.115.x; uses Pydantic v2 natively.
- `uvicorn[standard]` — includes `websockets` and `httptools` for production performance; `[standard]` extra is required.
- `langchain==0.3.7` + `langchain-core==0.3.21` + `langchain-anthropic==0.3.1` — the 0.3.x series is the stable release line compatible with Pydantic v2 and the Claude tool-calling interface. These three versions are mutually compatible (langchain 0.3.7 requires langchain-core >=0.3.15,<0.4; langchain-anthropic 0.3.1 requires langchain-core >=0.3.10,<0.4 and anthropic >=0.30.0,<1).
- `anthropic==0.40.0` — within langchain-anthropic 0.3.1's `anthropic>=0.30.0,<1` constraint; used directly for `_rewrite_analysis_with_constraints` and `_apply_constraints_via_claude`.
- `numpy==1.26.4` — last stable 1.x release; avoids numpy 2.0 API breaks that affect some scipy internals; compatible with scipy 1.14.1.
- `scipy==1.14.1` — provides `scipy.stats.qmc.LatinHypercube` (added in scipy 1.7.0).
- `aiofiles==24.1.0` — required by FastAPI's `StaticFiles` mount for async file serving.
- `pydantic==2.10.3` — explicit pin; FastAPI 0.115.5 defaults to Pydantic v2.

---

## 2. Project Bootstrap

Run these commands once. All commands assume your shell is in the repo root (`LabMind/`).

```bash
# Create virtual environment
python3.11 -m venv backend/.venv

# Activate
source backend/.venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt

# Verify install
python -c "import fastapi, langchain, langchain_anthropic, anthropic, scipy, numpy; print('OK')"

# Verify scipy LHS is available
python -c "from scipy.stats import qmc; s = qmc.LatinHypercube(d=5, seed=42); print(s.random(n=3))"

# Verify LangChain agent imports
python -c "
from langchain.agents import create_react_agent, AgentExecutor
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage
from langchain_anthropic import ChatAnthropic
from langchain.tools import Tool
print('LangChain imports OK')
"
```

Expected output of last command: `LangChain imports OK` (may also print a deprecation warning about `ConversationBufferMemory` — this is expected and harmless; see Section 6).

---

## 3. Environment Setup

Create `backend/.env` (never commit this file):

```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
FRONTEND_URL=http://localhost:3000
PORT=8000
DATA_DIR=./data
```

**How to obtain `ANTHROPIC_API_KEY`:**
1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key.
2. Copy the key (shown only once). It begins with `sk-ant-`.
3. Paste it as the value of `ANTHROPIC_API_KEY` in `backend/.env`.

Also create `backend/.env.example` (safe to commit):

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
FRONTEND_URL=http://localhost:3000
PORT=8000
DATA_DIR=./data
```

Load the env in Python using `python-dotenv`. Add this at the top of `main.py` before any other imports:

```python
from dotenv import load_dotenv
load_dotenv()
```

---

## 4. Mock Data Seeding

Write these three files to disk **before running any server code**. The server reads them on startup; missing files will cause 500 errors.

### 4.1 `backend/data/state.json`

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

### 4.2 `backend/data/batches/batch_B1.json`

Full 20-experiment wide-sweep batch. Best transfection: 0.64, mean: ~0.47.

```json
{
  "batch_id": "B1",
  "description": "Initial wide-parameter exploration",
  "status": "complete",
  "created_at": "2025-01-07T09:00:00Z",
  "experiments": [
    {
      "exp_id": "EXP-B1-01",
      "parameters": {"pH": 6.00, "temperature_c": 35, "concentration_mg_ml": 0.100, "lipid_ratio": "2:1", "incubation_hours": 2},
      "transfection_rate": 0.28, "cell_viability": 0.72, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-02",
      "parameters": {"pH": 8.00, "temperature_c": 42, "concentration_mg_ml": 0.500, "lipid_ratio": "4:1", "incubation_hours": 8},
      "transfection_rate": 0.31, "cell_viability": 0.69, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-03",
      "parameters": {"pH": 7.80, "temperature_c": 41, "concentration_mg_ml": 0.450, "lipid_ratio": "4:1", "incubation_hours": 7},
      "transfection_rate": 0.33, "cell_viability": 0.73, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-04",
      "parameters": {"pH": 6.10, "temperature_c": 35, "concentration_mg_ml": 0.120, "lipid_ratio": "2:1", "incubation_hours": 2},
      "transfection_rate": 0.34, "cell_viability": 0.76, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-05",
      "parameters": {"pH": 7.70, "temperature_c": 40, "concentration_mg_ml": 0.430, "lipid_ratio": "4:1", "incubation_hours": 6},
      "transfection_rate": 0.35, "cell_viability": 0.77, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-06",
      "parameters": {"pH": 7.50, "temperature_c": 40, "concentration_mg_ml": 0.400, "lipid_ratio": "4:1", "incubation_hours": 6},
      "transfection_rate": 0.37, "cell_viability": 0.79, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-07",
      "parameters": {"pH": 6.30, "temperature_c": 36, "concentration_mg_ml": 0.150, "lipid_ratio": "2:1", "incubation_hours": 3},
      "transfection_rate": 0.41, "cell_viability": 0.82, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-08",
      "parameters": {"pH": 7.30, "temperature_c": 39, "concentration_mg_ml": 0.370, "lipid_ratio": "3:1", "incubation_hours": 6},
      "transfection_rate": 0.43, "cell_viability": 0.81, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-09",
      "parameters": {"pH": 6.50, "temperature_c": 37, "concentration_mg_ml": 0.200, "lipid_ratio": "2:1", "incubation_hours": 4},
      "transfection_rate": 0.45, "cell_viability": 0.84, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-10",
      "parameters": {"pH": 7.10, "temperature_c": 38, "concentration_mg_ml": 0.330, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.47, "cell_viability": 0.84, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-11",
      "parameters": {"pH": 6.40, "temperature_c": 37, "concentration_mg_ml": 0.220, "lipid_ratio": "3:1", "incubation_hours": 3},
      "transfection_rate": 0.49, "cell_viability": 0.85, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-12",
      "parameters": {"pH": 7.00, "temperature_c": 38, "concentration_mg_ml": 0.300, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.50, "cell_viability": 0.86, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-13",
      "parameters": {"pH": 6.60, "temperature_c": 37, "concentration_mg_ml": 0.250, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.52, "cell_viability": 0.87, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-14",
      "parameters": {"pH": 6.80, "temperature_c": 37, "concentration_mg_ml": 0.270, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.53, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-15",
      "parameters": {"pH": 7.20, "temperature_c": 38, "concentration_mg_ml": 0.320, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.55, "cell_viability": 0.87, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-16",
      "parameters": {"pH": 6.90, "temperature_c": 37, "concentration_mg_ml": 0.290, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.57, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-17",
      "parameters": {"pH": 6.65, "temperature_c": 37, "concentration_mg_ml": 0.260, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.58, "cell_viability": 0.89, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-18",
      "parameters": {"pH": 7.40, "temperature_c": 38, "concentration_mg_ml": 0.350, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.61, "cell_viability": 0.87, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-19",
      "parameters": {"pH": 6.70, "temperature_c": 37, "concentration_mg_ml": 0.275, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.62, "cell_viability": 0.90, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B1-20",
      "parameters": {"pH": 6.75, "temperature_c": 37, "concentration_mg_ml": 0.280, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.64, "cell_viability": 0.91, "is_top_performer": true
    }
  ]
}
```

**Verification:** Sum of transfection rates = 9.35, mean = 0.4675 ≈ 0.47. Exactly one `is_top_performer: true` (EXP-B1-20).

### 4.3 `backend/data/batches/batch_B2.json`

Full 20-experiment refined batch centered on B1 top performer (pH 6.6–7.1, conc 0.22–0.33). Best transfection: 0.84, mean: ~0.71.

```json
{
  "batch_id": "B2",
  "description": "Refined around pH 6.6–7.0, reduced concentration range",
  "status": "complete",
  "created_at": "2025-01-14T09:00:00Z",
  "experiments": [
    {
      "exp_id": "EXP-B2-01",
      "parameters": {"pH": 6.70, "temperature_c": 37, "concentration_mg_ml": 0.280, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.84, "cell_viability": 0.91, "is_top_performer": true
    },
    {
      "exp_id": "EXP-B2-02",
      "parameters": {"pH": 6.78, "temperature_c": 37, "concentration_mg_ml": 0.288, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.76, "cell_viability": 0.90, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-03",
      "parameters": {"pH": 6.72, "temperature_c": 37, "concentration_mg_ml": 0.275, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.76, "cell_viability": 0.90, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-04",
      "parameters": {"pH": 6.75, "temperature_c": 38, "concentration_mg_ml": 0.285, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.75, "cell_viability": 0.90, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-05",
      "parameters": {"pH": 6.82, "temperature_c": 38, "concentration_mg_ml": 0.292, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.75, "cell_viability": 0.89, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-06",
      "parameters": {"pH": 6.65, "temperature_c": 37, "concentration_mg_ml": 0.260, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.75, "cell_viability": 0.89, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-07",
      "parameters": {"pH": 6.68, "temperature_c": 37, "concentration_mg_ml": 0.270, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.74, "cell_viability": 0.89, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-08",
      "parameters": {"pH": 6.62, "temperature_c": 37, "concentration_mg_ml": 0.255, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.74, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-09",
      "parameters": {"pH": 6.85, "temperature_c": 37, "concentration_mg_ml": 0.295, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.74, "cell_viability": 0.89, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-10",
      "parameters": {"pH": 6.80, "temperature_c": 38, "concentration_mg_ml": 0.290, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.73, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-11",
      "parameters": {"pH": 6.92, "temperature_c": 38, "concentration_mg_ml": 0.302, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.73, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-12",
      "parameters": {"pH": 6.88, "temperature_c": 38, "concentration_mg_ml": 0.298, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.72, "cell_viability": 0.88, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-13",
      "parameters": {"pH": 6.60, "temperature_c": 36, "concentration_mg_ml": 0.240, "lipid_ratio": "3:1", "incubation_hours": 4},
      "transfection_rate": 0.71, "cell_viability": 0.87, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-14",
      "parameters": {"pH": 6.95, "temperature_c": 38, "concentration_mg_ml": 0.305, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.70, "cell_viability": 0.87, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-15",
      "parameters": {"pH": 7.00, "temperature_c": 38, "concentration_mg_ml": 0.310, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.69, "cell_viability": 0.86, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-16",
      "parameters": {"pH": 7.05, "temperature_c": 38, "concentration_mg_ml": 0.315, "lipid_ratio": "3:1", "incubation_hours": 5},
      "transfection_rate": 0.67, "cell_viability": 0.86, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-17",
      "parameters": {"pH": 6.55, "temperature_c": 36, "concentration_mg_ml": 0.230, "lipid_ratio": "3:1", "incubation_hours": 3},
      "transfection_rate": 0.65, "cell_viability": 0.85, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-18",
      "parameters": {"pH": 6.58, "temperature_c": 36, "concentration_mg_ml": 0.235, "lipid_ratio": "3:1", "incubation_hours": 3},
      "transfection_rate": 0.63, "cell_viability": 0.84, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-19",
      "parameters": {"pH": 6.50, "temperature_c": 36, "concentration_mg_ml": 0.220, "lipid_ratio": "2:1", "incubation_hours": 3},
      "transfection_rate": 0.61, "cell_viability": 0.83, "is_top_performer": false
    },
    {
      "exp_id": "EXP-B2-20",
      "parameters": {"pH": 7.10, "temperature_c": 39, "concentration_mg_ml": 0.325, "lipid_ratio": "4:1", "incubation_hours": 6},
      "transfection_rate": 0.59, "cell_viability": 0.82, "is_top_performer": false
    }
  ]
}
```

**Verification:** Sum of transfection rates = 14.26, mean = 0.713 ≈ 0.71. Exactly one `is_top_performer: true` (EXP-B2-01).

### 4.4 Seed the static images

The server mounts `backend/static/` for fluorescence image URLs. You must place 6 image files there or the frontend will show broken images. For local dev, 1×1 pixel PNG placeholders are sufficient:

```bash
mkdir -p backend/static/images

# Generate 6 minimal placeholder PNGs using Python (no external deps)
python3 - <<'EOF'
import struct, zlib, os

def make_png(path, r, g, b):
    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    ihdr = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    raw = bytes([0, r, g, b])
    idat = zlib.compress(raw)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

base = 'backend/static/images'
make_png(f'{base}/positive_1.png', 0, 200, 100)   # bright green — high transfection
make_png(f'{base}/positive_2.png', 0, 160, 80)    # medium green
make_png(f'{base}/positive_3.png', 0, 100, 50)    # dim green
make_png(f'{base}/negative_1.png', 80, 80, 80)    # medium gray — baseline
make_png(f'{base}/negative_2.png', 50, 50, 50)    # dark gray
make_png(f'{base}/negative_3.png', 30, 30, 30)    # very dark
print("6 placeholder images written to backend/static/images/")
EOF
```

### 4.5 Create the proposals directory

```bash
mkdir -p backend/data/proposals
```

Do **not** pre-seed `pending.json` — it is generated by the agent during the first `POST /api/simulate` cycle.

---

## 5. LangChain + Anthropic SDK Import Path Reference

For `langchain==0.3.7`, `langchain-core==0.3.21`, `langchain-anthropic==0.3.1`:

| Symbol | Correct import path in 0.3.x | Notes |
|---|---|---|
| `ChatAnthropic` | `from langchain_anthropic import ChatAnthropic` | Canonical; works. |
| `create_react_agent` | `from langchain.agents import create_react_agent` | Works; re-exported from langchain-core. |
| `AgentExecutor` | `from langchain.agents import AgentExecutor` | Works. |
| `ConversationBufferMemory` | `from langchain.memory import ConversationBufferMemory` | Works but emits `LangChainDeprecationWarning`. See note below. |
| `ChatPromptTemplate` | `from langchain.prompts import ChatPromptTemplate` | Works (re-exported from `langchain_core.prompts`). Alternatively: `from langchain_core.prompts import ChatPromptTemplate`. |
| `MessagesPlaceholder` | `from langchain.prompts import MessagesPlaceholder` | Same as above. |
| `SystemMessage` | `from langchain_core.messages import SystemMessage` | Canonical. |
| `Tool` | `from langchain.tools import Tool` | Works in 0.3.x. |

**`ConversationBufferMemory` deprecation warning:**  
In 0.3.x, `ConversationBufferMemory` prints:
```
LangChainDeprecationWarning: Please see the migration guide at: https://python.langchain.com/docs/versions/migrating_memory/
```
This is a warning only — it does not break functionality. Suppress it in production by adding at the top of `agent.py`:
```python
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="langchain")
```

**`create_react_agent` behavior with Claude:**  
`create_react_agent` uses the text-based ReAct format (Thought / Action / Action Input / Observation) rather than Claude's native function calling. `handle_parsing_errors=True` in `AgentExecutor` is critical — without it, any parsing failure raises an exception instead of retrying. This is already specified in the architecture and must not be removed.

---

## 6. Build Order

Implement tasks in this exact sequence. Each task names the file, the specific function/class, and a verification command to confirm "done" before moving to the next task.

---

### Task 1 — Create directory structure

```bash
mkdir -p backend/data/batches
mkdir -p backend/data/proposals
mkdir -p backend/static/images
touch backend/main.py backend/agent.py backend/tools.py backend/state_manager.py backend/models.py
```

**Done when:** `ls backend/` shows all 5 `.py` files; `ls backend/data/` shows `batches/` and `proposals/`.

---

### Task 2 — Write `backend/requirements.txt` and `backend/Procfile` and `backend/runtime.txt`

Write `requirements.txt` exactly as shown in Section 1.

Write `backend/Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Write `backend/runtime.txt`:
```
python-3.11.9
```

**Done when:**
```bash
cd backend && pip install -r requirements.txt && python -c "import fastapi; print(fastapi.__version__)"
```
Prints `0.115.5`.

---

### Task 3 — Seed mock data files

Write `data/state.json`, `data/batches/batch_B1.json`, `data/batches/batch_B2.json` exactly as shown in Section 4. Generate placeholder images and create `data/proposals/` directory as shown in Section 4.4–4.5.

**Done when:**
```bash
python -c "
import json
s = json.load(open('backend/data/state.json'))
b1 = json.load(open('backend/data/batches/batch_B1.json'))
b2 = json.load(open('backend/data/batches/batch_B2.json'))
assert s['current_state'] == 'RUNNING'
assert len(b1['experiments']) == 20
assert len(b2['experiments']) == 20
assert sum(1 for e in b1['experiments'] if e['is_top_performer']) == 1
assert sum(1 for e in b2['experiments'] if e['is_top_performer']) == 1
assert max(e['transfection_rate'] for e in b2['experiments']) == 0.84
print('Mock data OK')
"
```

---

### Task 4 — Implement `backend/models.py`

Copy the Pydantic v2 models exactly from Section 5.5 of `software-architecture.md`. No logic — only model definitions.

**Done when:**
```bash
python -c "
from backend.models import (
    ChatRequest, ChatResponse, StatusResponse, BatchResponse,
    BatchSummary, SimulateResponse, ApproveResponse, RegenerateResponse,
    ImageUrls, ProposalSummary
)
print('models.py OK')
"
```
Or, from inside the `backend/` directory:
```bash
cd backend && python -c "from models import ChatRequest, StatusResponse, BatchResponse; print('models.py OK')"
```

---

### Task 5 — Implement `backend/state_manager.py` — `StateManager.__init__`

Implement `StateManager.__init__` from Section 5.4. It must:
1. Set `self.data_dir = Path(data_dir)`
2. Initialize `self._lock = threading.Lock()`
3. Create `data_dir/batches/` and `data_dir/proposals/` if missing (use `Path.mkdir(parents=True, exist_ok=True)`)
4. If `data_dir/state.json` does not exist, write the IDLE defaults:
   ```json
   {"current_state": "IDLE", "current_batch_id": null, "pending_proposal_id": null,
    "chat_history": [], "latest_analysis": null, "latest_constraints": null, "image_urls": null}
   ```

**Done when:**
```bash
cd backend && python -c "
from state_manager import StateManager
import json, tempfile, os
with tempfile.TemporaryDirectory() as d:
    sm = StateManager(d)
    s = json.load(open(os.path.join(d, 'state.json')))
    assert s['current_state'] == 'IDLE'
    print('StateManager.__init__ OK')
"
```

---

### Task 6 — Implement `StateManager.get_state`, `set_state`, `update_state`

All three methods must acquire `self._lock` before reading/writing `state.json`.

- `get_state()`: reads and returns full dict. No mutation.
- `set_state(new_state)`: validates `new_state` is in `STATE_ENUM`; reads state, sets `current_state`, writes back.
- `update_state(updates)`: reads state, merges `updates` dict (only keys present in `updates` are modified), writes back.

**Done when:**
```bash
cd backend && python -c "
from state_manager import StateManager
import tempfile
with tempfile.TemporaryDirectory() as d:
    sm = StateManager(d)
    sm.set_state('RUNNING')
    sm.update_state({'current_batch_id': 'B2', 'latest_analysis': 'test'})
    s = sm.get_state()
    assert s['current_state'] == 'RUNNING'
    assert s['current_batch_id'] == 'B2'
    assert s['latest_analysis'] == 'test'
    assert s['pending_proposal_id'] is None  # untouched
    print('get/set/update OK')
"
```

---

### Task 7 — Implement remaining `StateManager` methods

Implement in this order:
1. `append_chat_message(role, content)` — reads state, appends `{"role": role, "content": content}` to `chat_history`, writes back. Validate `role in ("user", "agent")`.
2. `reset_chat()` — sets `chat_history = []` and `latest_constraints = None`.
3. `write_proposal(proposal)` — writes `proposal` as JSON to `data_dir/proposals/pending.json`. Thread-safe.
4. `read_proposal()` — reads and returns `data_dir/proposals/pending.json`. Raises `FileNotFoundError` if absent.
5. `read_batch(batch_id)` — reads `data_dir/batches/batch_{batch_id}.json`. Raises `FileNotFoundError` if absent.
6. `write_batch(batch_id, batch_data)` — writes `data_dir/batches/batch_{batch_id}.json`. Thread-safe.
7. `list_batch_ids()` — lists `data_dir/batches/`, filters `batch_B*.json`, returns sorted list of IDs by numeric suffix (e.g., `["B1", "B2"]`).

**Done when:**
```bash
cd backend && python -c "
from state_manager import StateManager
import tempfile, json
with tempfile.TemporaryDirectory() as d:
    sm = StateManager(d)
    sm.append_chat_message('user', 'hello')
    sm.append_chat_message('agent', 'hi')
    s = sm.get_state()
    assert len(s['chat_history']) == 2
    sm.reset_chat()
    s = sm.get_state()
    assert s['chat_history'] == []
    sm.write_proposal({'proposal_id': 'B3', 'experiments': []})
    p = sm.read_proposal()
    assert p['proposal_id'] == 'B3'
    sm.write_batch('B1', {'batch_id': 'B1'})
    b = sm.read_batch('B1')
    assert b['batch_id'] == 'B1'
    ids = sm.list_batch_ids()
    assert ids == ['B1']
    print('StateManager all methods OK')
"
```

---

### Task 8 — Implement `backend/tools.py` — pure implementations (no LangChain yet)

Implement these four functions in `tools.py`. Do not add LangChain Tool wrappers yet.

**8a. `load_batch_results_impl(batch_id)`**

```python
import json, os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))

def load_batch_results_impl(batch_id: str) -> dict:
    path = DATA_DIR / "batches" / f"batch_{batch_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Batch file not found: {path}")
    return json.loads(path.read_text())
```

**8b. `find_top_performer_impl(experiments)`**

```python
import statistics

def find_top_performer_impl(experiments: list[dict]) -> dict:
    ranked = sorted(experiments, key=lambda e: e["transfection_rate"], reverse=True)
    top = ranked[0]
    rates = [e["transfection_rate"] for e in experiments]
    return {
        "top_experiment": top,
        "batch_mean": round(statistics.mean(rates), 4),
        "batch_std": round(statistics.stdev(rates), 4),
        "top_transfection_rate": top["transfection_rate"],
    }
```

**8c. `get_comparison_images_impl(top_performer, baseline_transfection_rate)`**

```python
def get_comparison_images_impl(top_performer: dict, baseline_transfection_rate: float) -> dict:
    rate = top_performer["transfection_rate"]
    if rate >= 0.75:
        optimal = "/static/images/positive_1.png"
    elif rate >= 0.50:
        optimal = "/static/images/positive_2.png"
    else:
        optimal = "/static/images/positive_3.png"

    if baseline_transfection_rate >= 0.50:
        baseline = "/static/images/negative_1.png"
    elif baseline_transfection_rate >= 0.30:
        baseline = "/static/images/negative_2.png"
    else:
        baseline = "/static/images/negative_3.png"

    return {"optimal": optimal, "baseline": baseline}
```

**8d. `_get_sampling_bounds`, `generate_next_batch_impl`, and helpers**

Copy these exactly from Section 7 of `software-architecture.md`:
- `PARAM_BOUNDS`, `PARAM_KEYS`, `N_CANDIDATES`, `SAMPLING_RADIUS_FRACTION` constants
- `_get_sampling_bounds(top_performer)` — copy verbatim
- `_apply_constraints_via_claude(experiments, constraints)` — copy verbatim

**`_prev_batch_id` — not defined in the architecture but required by `generate_next_batch_impl`:**  
Define it in `tools.py` alongside the other helpers:
```python
def _prev_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n - 1}"
```

**`generate_next_batch_impl` — copy from Section 7.3 with one correction:**  
The `StateManager` instantiation inside `generate_next_batch_impl` uses a hardcoded `data_dir`:
```python
state_manager = StateManager(data_dir="data")
```
Replace with:
```python
state_manager = StateManager(data_dir=str(DATA_DIR))
```
This ensures it respects the `DATA_DIR` env var.

**Done when:**
```bash
cd backend && python -c "
from tools import load_batch_results_impl, find_top_performer_impl, get_comparison_images_impl
b = load_batch_results_impl('B2')
assert b['batch_id'] == 'B2'
result = find_top_performer_impl(b['experiments'])
assert result['top_transfection_rate'] == 0.84
imgs = get_comparison_images_impl(result['top_experiment'], 0.47)
assert imgs == {'optimal': '/static/images/positive_1.png', 'baseline': '/static/images/negative_2.png'}
print('Pure tool impls OK')
"
```

---

### Task 9 — Implement `backend/tools.py` — LangChain Tool wrappers

Add the `_tool_*` wrapper functions and the four `Tool` objects. Each wrapper:
- Takes a single `str` input
- Calls the corresponding `*_impl` function
- Returns a JSON string
- Wraps in `try/except` and returns an error string on failure (the agent's `handle_parsing_errors` will catch it)

```python
import json
from langchain.tools import Tool

def _tool_load_batch_results(batch_id: str) -> str:
    try:
        return json.dumps(load_batch_results_impl(batch_id.strip()))
    except Exception as e:
        return f"Error: {e}"

def _tool_find_top_performer(results_json: str) -> str:
    try:
        experiments = json.loads(results_json)
        if isinstance(experiments, dict) and "experiments" in experiments:
            experiments = experiments["experiments"]
        return json.dumps(find_top_performer_impl(experiments))
    except Exception as e:
        return f"Error: {e}"

def _tool_generate_next_batch(input_json: str) -> str:
    try:
        data = json.loads(input_json)
        experiments = generate_next_batch_impl(
            top_performer=data["top_performer"],
            constraints=data.get("constraints", ""),
            batch_id=data["batch_id"],
        )
        return json.dumps(experiments)
    except Exception as e:
        return f"Error: {e}"

def _tool_get_comparison_images(input_json: str) -> str:
    try:
        data = json.loads(input_json)
        return json.dumps(get_comparison_images_impl(
            top_performer=data["top_performer"],
            baseline_transfection_rate=float(data["baseline_transfection_rate"]),
        ))
    except Exception as e:
        return f"Error: {e}"

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

**Done when:**
```bash
cd backend && python -c "
from tools import LOAD_BATCH_TOOL, FIND_TOP_PERFORMER_TOOL, GET_COMPARISON_IMAGES_TOOL
import json
result = LOAD_BATCH_TOOL.func('B2')
data = json.loads(result)
assert data['batch_id'] == 'B2'
top_result = FIND_TOP_PERFORMER_TOOL.func(json.dumps(data['experiments']))
top_data = json.loads(top_result)
assert top_data['top_transfection_rate'] == 0.84
print('LangChain tool wrappers OK')
"
```

---

### Task 10 — Implement `backend/agent.py` — `LabMindAgent.__init__`

**Note on `_next_batch_id`:** This function is used inside `run_analysis_loop` but is defined in `main.py`. Do NOT import from `main.py` (circular import). Define it locally in `agent.py`:

```python
def _next_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n + 1}"
```

Implement `LabMindAgent.__init__` from Section 6.2 of `software-architecture.md`. Copy the system prompt from Section 6.3 exactly as a module-level constant `SYSTEM_PROMPT`.

**Done when:**
```bash
cd backend && python -c "
from agent import LabMindAgent
a = LabMindAgent()
assert a.llm is not None
assert len(a.tools) == 4
assert a.executor is not None
print('LabMindAgent.__init__ OK')
"
```

---

### Task 11 — Implement `LabMindAgent._parse_analysis_output`

```python
import json
import re

def _parse_analysis_output(self, raw_output: str) -> dict:
    # Strip markdown code fences if present
    cleaned = re.sub(r'```(?:json)?\s*', '', raw_output).strip()
    cleaned = cleaned.replace('```', '').strip()
    start = cleaned.find('{')
    end = cleaned.rfind('}') + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in agent output: {raw_output[:300]}")
    return json.loads(cleaned[start:end])
```

**Done when:**
```bash
cd backend && python -c "
from agent import LabMindAgent
a = LabMindAgent()
raw = '```json\n{\"analysis_text\": \"test\", \"image_urls\": {\"optimal\": \"/a\", \"baseline\": \"/b\"}}\n\`\`\`'
result = a._parse_analysis_output(raw)
assert result['analysis_text'] == 'test'
print('_parse_analysis_output OK')
"
```

---

### Task 12 — Implement `LabMindAgent.run_analysis_loop` and `chat`

Implement from Sections 6.4 and 6.5 of `software-architecture.md`.

`run_analysis_loop` must include a retry loop (3 attempts) around `_parse_analysis_output`:

```python
def run_analysis_loop(self, batch_id: str) -> dict:
    next_batch_id = _next_batch_id(batch_id)
    input_text = (
        f"Analyze completed batch {batch_id} and generate a proposal for batch {next_batch_id}. "
        f"No constraints from the researcher at this time."
    )
    last_error = None
    for attempt in range(3):
        result = self.executor.invoke({"input": input_text})
        try:
            return self._parse_analysis_output(result["output"])
        except (ValueError, Exception) as e:
            last_error = e
            input_text = (
                f"Your previous response could not be parsed as JSON. "
                f"Please respond with ONLY the JSON object as specified in the system prompt. "
                f"No extra text. Batch: {batch_id}, proposal: {next_batch_id}."
            )
    raise RuntimeError(f"Agent failed to produce structured output after 3 attempts: {last_error}")
```

**Done when:** (requires valid `ANTHROPIC_API_KEY` in `.env`)
```bash
cd backend && python -c "
from dotenv import load_dotenv; load_dotenv()
from agent import LabMindAgent
a = LabMindAgent()
result = a.run_analysis_loop('B2')
assert 'analysis_text' in result
assert 'image_urls' in result
assert 'optimal' in result['image_urls']
print('run_analysis_loop OK')
print('analysis_text:', result['analysis_text'][:80])
"
```
This will make a live API call to Anthropic. Expect 30–90 seconds.

---

### Task 13 — Implement `backend/models.py` — verify `_compute_proposal_summary`

Add `_compute_proposal_summary` as a module-level function in `models.py` (not inside a class — it's used by `main.py`'s status endpoint). Copy from Section 7.5 of `software-architecture.md` exactly.

**Done when:**
```bash
cd backend && python -c "
from models import _compute_proposal_summary
import json
experiments = json.load(open('data/proposals/pending.json'))['experiments'] if __import__('pathlib').Path('data/proposals/pending.json').exists() else []
print('_compute_proposal_summary importable OK')
"
```

---

### Task 14 — Implement `backend/main.py` — app setup, CORS, static files, health check

Write the `main.py` shell: imports, app instantiation, module-level singletons, CORS middleware, static files mount, and the `/health` endpoint.

```python
import os
import asyncio
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import anthropic

from state_manager import StateManager
from agent import LabMindAgent
from models import (
    ChatRequest, ChatResponse,
    StatusResponse, BatchResponse, BatchSummary,
    SimulateResponse, ApproveResponse, RegenerateResponse,
    ImageUrls, ProposalSummary, _compute_proposal_summary,
)

app = FastAPI(title="LabMind API")

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

app.mount("/static", StaticFiles(directory="static"), name="static")

DATA_DIR = os.environ.get("DATA_DIR", "data")
state_manager = StateManager(data_dir=DATA_DIR)
agent = LabMindAgent()

@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}
```

**Done when:**
```bash
cd backend && uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/health
# Expected: {"status":"ok"}
kill %1
```

---

### Task 15 — Implement `main.py` helper functions

Add these module-level helpers before the endpoint functions:

```python
def _next_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n + 1}"

def is_constraint_message(message: str) -> bool:
    keywords = [
        "exclude", "avoid", "cap", "limit", "no more than", "at most",
        "at least", "below", "above", "don't", "must not", "restrict",
        "maximum", "minimum", "max", "min",
    ]
    lower = message.lower()
    return any(kw in lower for kw in keywords)

def _rewrite_analysis_with_constraints(
    existing_analysis: str, constraints: str, top_performer: dict
) -> str:
    client = anthropic.Anthropic()
    prompt = (
        f"Rewrite the following scientific analysis to incorporate the researcher's constraint. "
        f"Keep the same 3–4 sentence structure and scientific tone. "
        f"Add a sentence explaining why the constraint makes scientific sense given the top performer data.\n\n"
        f"Original analysis:\n{existing_analysis}\n\n"
        f"Researcher constraint: {constraints}\n\n"
        f"Top performer parameters: {json.dumps(top_performer['parameters'])}\n\n"
        f"Return only the rewritten analysis text — no JSON, no markdown."
    )
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()
```

**Done when:** `cd backend && python -c "from main import _next_batch_id, is_constraint_message; assert _next_batch_id('B2') == 'B3'; assert is_constraint_message('exclude pH above 7.5') is True; print('helpers OK')"` (Note: import via direct run — do not `import main` if uvicorn isn't expected to run.)

---

### Task 16 — Implement `main.py` — all 7 API endpoints

Implement each endpoint function and register it with the decorator. State validation must happen before any side effects; return 409 on invalid state.

**`POST /api/simulate`:**
```python
@app.post("/api/simulate", response_model=SimulateResponse)
async def simulate_endpoint(background_tasks: BackgroundTasks) -> SimulateResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("IDLE", "RUNNING"):
        raise HTTPException(status_code=409, detail=f"Cannot simulate: current state is {s['current_state']}")
    state_manager.set_state("RUNNING")
    if s["current_batch_id"] is None:
        state_manager.update_state({"current_batch_id": "B1"})
    current_state = state_manager.get_state()
    background_tasks.add_task(run_agent_loop, current_state["current_batch_id"])
    return SimulateResponse(status="started")
```

**`GET /api/status`:**
```python
@app.get("/api/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    s = state_manager.get_state()
    image_urls = ImageUrls(**s["image_urls"]) if s.get("image_urls") else None
    proposal_summary = None
    if s["current_state"] in ("PROPOSAL_READY", "EDITING", "REGENERATING"):
        try:
            proposal = state_manager.read_proposal()
            proposal_summary_dict = _compute_proposal_summary(proposal["experiments"], s["image_urls"])
            proposal_summary = ProposalSummary(**proposal_summary_dict)
        except FileNotFoundError:
            pass
    return StatusResponse(
        current_state=s["current_state"],
        current_batch_id=s.get("current_batch_id"),
        pending_proposal_id=s.get("pending_proposal_id"),
        chat_history=s.get("chat_history", []),
        latest_analysis=s.get("latest_analysis"),
        latest_constraints=s.get("latest_constraints"),
        image_urls=image_urls,
        proposal_summary=proposal_summary,
    )
```

**`GET /api/batch/{batch_id}`:**
```python
@app.get("/api/batch/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str) -> BatchResponse:
    try:
        data = state_manager.read_batch(batch_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return BatchResponse(**data)
```

**`GET /api/batches`:**
```python
@app.get("/api/batches", response_model=list[BatchSummary])
async def get_all_batches() -> list[BatchSummary]:
    ids = state_manager.list_batch_ids()
    summaries = []
    for bid in ids:
        data = state_manager.read_batch(bid)
        rates = [e["transfection_rate"] for e in data["experiments"] if e.get("transfection_rate") is not None]
        summaries.append(BatchSummary(
            batch_id=data["batch_id"],
            description=data["description"],
            status=data["status"],
            experiment_count=len(data["experiments"]),
            best_transfection_rate=round(max(rates), 2) if rates else None,
            mean_transfection_rate=round(sum(rates) / len(rates), 2) if rates else None,
        ))
    return summaries
```

**`POST /api/chat`:**
```python
@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(body: ChatRequest, background_tasks: BackgroundTasks) -> ChatResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("PROPOSAL_READY", "EDITING"):
        raise HTTPException(status_code=409, detail="Chat is only available during PROPOSAL_READY or EDITING states")
    state_manager.append_chat_message("user", body.message)
    reply = await asyncio.to_thread(agent.chat, body.message)
    state_manager.append_chat_message("agent", reply)
    state_changed = is_constraint_message(body.message)
    if state_changed:
        state_manager.update_state({"latest_constraints": body.message})
        state_manager.set_state("EDITING")
    new_state = state_manager.get_state()["current_state"]
    return ChatResponse(response=reply, state_changed=state_changed, new_state=new_state)
```

**`POST /api/approve`:**
```python
@app.post("/api/approve", response_model=ApproveResponse)
async def approve_endpoint(background_tasks: BackgroundTasks) -> ApproveResponse:
    s = state_manager.get_state()
    if s["current_state"] != "PROPOSAL_READY":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot approve: current state is {s['current_state']}. Regenerate or continue to PROPOSAL_READY first."
        )
    state_manager.set_state("APPROVED")
    background_tasks.add_task(finalize_approval)
    return ApproveResponse(status="approved")
```

**`POST /api/regenerate`:**
```python
@app.post("/api/regenerate", response_model=RegenerateResponse)
async def regenerate_endpoint(background_tasks: BackgroundTasks) -> RegenerateResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("EDITING", "PROPOSAL_READY"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot regenerate: no constraints set. Send a constraint message first."
        )
    if not s.get("latest_constraints"):
        raise HTTPException(
            status_code=409,
            detail="Cannot regenerate: no constraints set. Send a constraint message in chat first."
        )
    state_manager.set_state("REGENERATING")
    background_tasks.add_task(run_regeneration)
    return RegenerateResponse(status="started")
```

**Done when:**
```bash
cd backend && uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/status | python3 -m json.tool
curl -s http://localhost:8000/api/batches | python3 -m json.tool
curl -s http://localhost:8000/api/batch/B2 | python3 -m json.tool | head -20
kill %1
```
All three should return valid JSON with correct data.

---

### Task 17 — Implement `main.py` — three background task functions

**`run_agent_loop`** (copy from Section 5.1, architecture):
```python
async def run_agent_loop(batch_id: str) -> None:
    await asyncio.sleep(2)
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

**`run_regeneration`** (copy from Section 5.1, architecture):
```python
async def run_regeneration() -> None:
    from tools import load_batch_results_impl, find_top_performer_impl, generate_next_batch_impl
    s = state_manager.get_state()
    batch_id = s["current_batch_id"]
    constraints = s["latest_constraints"]
    pending_id = s["pending_proposal_id"]

    batch_data = await asyncio.to_thread(load_batch_results_impl, batch_id)
    top_result = find_top_performer_impl(batch_data["experiments"])
    top_performer = top_result["top_experiment"]
    experiments = await asyncio.to_thread(generate_next_batch_impl, top_performer, constraints, pending_id)

    proposal = {
        "proposal_id": pending_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_batch_id": batch_id,
        "top_performer_id": top_performer["exp_id"],
        "constraints_applied": constraints,
        "experiments": experiments,
    }
    state_manager.write_proposal(proposal)

    new_analysis = await asyncio.to_thread(
        _rewrite_analysis_with_constraints, s["latest_analysis"], constraints, top_performer
    )
    state_manager.update_state({"latest_analysis": new_analysis})
    state_manager.set_state("PROPOSAL_READY")
```

**`finalize_approval`:**
```python
async def finalize_approval() -> None:
    proposal = state_manager.read_proposal()
    next_id = proposal["proposal_id"]
    new_batch = {
        "batch_id": next_id,
        "description": f"Proposed batch generated from {proposal['source_batch_id']} top performer",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "experiments": [
            {**exp, "transfection_rate": None, "cell_viability": None, "is_top_performer": False}
            for exp in proposal["experiments"]
        ],
    }
    state_manager.write_batch(next_id, new_batch)
    state_manager.update_state({
        "current_batch_id": next_id,
        "pending_proposal_id": None,
        "latest_constraints": None,
        "latest_analysis": None,
        "image_urls": None,
    })
    state_manager.reset_chat()
    state_manager.set_state("RUNNING")
```

**Done when:** Server starts without errors:
```bash
cd backend && uvicorn main:app --reload --port 8000
```
Expected: no import errors, no startup errors.

---

## 7. CORS + Static Files Configuration

**Exact CORS middleware** (already in Task 14, repeated here for reference):

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

**Behavior when `FRONTEND_URL` is absent (local dev):**  
`os.environ.get("FRONTEND_URL", "http://localhost:3000")` returns `"http://localhost:3000"` as the default. The `allow_origins` list then contains `"http://localhost:3000"` twice, which is harmless — FastAPI deduplicates the CORS check. Local dev requires no extra configuration.

**Static files mount:**

```python
app.mount("/static", StaticFiles(directory="static"), name="static")
```

This must be placed **after** CORS middleware and **after** all route registrations to avoid shadowing API routes. The `directory="static"` path is relative to the CWD when uvicorn starts. Since the `Procfile` runs from `backend/`, the path resolves to `backend/static/`.

**Test CORS locally:**
```bash
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:8000/api/status -v 2>&1 | grep "Access-Control"
```
Expected output includes: `Access-Control-Allow-Origin: http://localhost:3000`

**Test static files:**
```bash
curl -I http://localhost:8000/static/images/positive_1.png
```
Expected: `HTTP/1.1 200 OK` with `Content-Type: image/png`

---

## 8. Verification Checklist — Full Happy Path

Start the server before running any checks:
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Run each check in a separate terminal. Commands are in order — complete each before starting the next.

---

### Check 1 — Health

```bash
curl -s http://localhost:8000/health
```

**Expected response:**
```json
{"status":"ok"}
```

**Expected `state.json`:** No change (health check is read-only).

---

### Check 2 — Initial status (RUNNING from seeded data)

```bash
curl -s http://localhost:8000/api/status | python3 -m json.tool
```

**Expected response:**
```json
{
  "current_state": "RUNNING",
  "current_batch_id": "B2",
  "pending_proposal_id": null,
  "chat_history": [],
  "latest_analysis": null,
  "latest_constraints": null,
  "image_urls": null,
  "proposal_summary": null
}
```

**Expected `state.json`:** Matches seeded content exactly.

---

### Check 3 — Trigger simulation

```bash
curl -s -X POST http://localhost:8000/api/simulate
```

**Expected response:**
```json
{"status":"started"}
```

**Expected `state.json` immediately after (before background task completes):**
```json
{"current_state": "RUNNING", "current_batch_id": "B2", ...}
```

**Confirm 409 on double-trigger while ANALYZING:**
```bash
# Wait ~3 seconds then try:
curl -s -X POST http://localhost:8000/api/simulate
```
Expected: `{"detail":"Cannot simulate: current state is ANALYZING"}`

---

### Check 4 — Poll until PROPOSAL_READY

```bash
# Poll every 4 seconds, stop when PROPOSAL_READY
while true; do
  STATE=$(curl -s http://localhost:8000/api/status | python3 -c "import sys,json; print(json.load(sys.stdin)['current_state'])")
  echo "$(date +%H:%M:%S) — $STATE"
  [ "$STATE" = "PROPOSAL_READY" ] && break
  sleep 4
done
```

**Expected state progression:** `RUNNING` → `COMPLETE` → `ANALYZING` → `PROPOSAL_READY` (total ~30–90 seconds depending on Claude response time)

**Expected `state.json` when PROPOSAL_READY:**
```json
{
  "current_state": "PROPOSAL_READY",
  "current_batch_id": "B2",
  "pending_proposal_id": "B3",
  "chat_history": [],
  "latest_analysis": "<3-4 sentence scientific text from Claude>",
  "latest_constraints": null,
  "image_urls": {"optimal": "/static/images/positive_1.png", "baseline": "/static/images/negative_2.png"}
}
```

**Expected `data/proposals/pending.json`:** Exists and contains `proposal_id: "B3"` with 20 experiments.

**Full status response:**
```bash
curl -s http://localhost:8000/api/status | python3 -m json.tool
```
Expected: `proposal_summary` is populated with `experiment_count: 20` and numeric `param_ranges`.

---

### Check 5 — Chat (non-constraint message — no state change)

```bash
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What was the best transfection rate in batch B2?"}'
```

**Expected response:**
```json
{
  "response": "<agent's answer about B2 — conversational>",
  "state_changed": false,
  "new_state": "PROPOSAL_READY"
}
```

**Expected `state.json`:** `current_state` remains `PROPOSAL_READY`. `chat_history` has 2 entries (user + agent).

---

### Check 6 — Chat (constraint message — triggers EDITING)

```bash
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Can we exclude concentrations above 0.3 mg/mL?"}'
```

**Expected response:**
```json
{
  "response": "<agent acknowledges constraint in ≤3 sentences>",
  "state_changed": true,
  "new_state": "EDITING"
}
```

**Expected `state.json`:**
```json
{
  "current_state": "EDITING",
  "latest_constraints": "Can we exclude concentrations above 0.3 mg/mL?",
  "chat_history": [
    {"role": "user", "content": "What was the best transfection rate in batch B2?"},
    {"role": "agent", "content": "..."},
    {"role": "user", "content": "Can we exclude concentrations above 0.3 mg/mL?"},
    {"role": "agent", "content": "..."}
  ]
}
```

---

### Check 7 — Regenerate proposal

```bash
curl -s -X POST http://localhost:8000/api/regenerate
```

**Expected response:**
```json
{"status":"started"}
```

**Expected `state.json` immediately:**
```json
{"current_state": "REGENERATING", ...}
```

**Poll until PROPOSAL_READY again:**
```bash
while true; do
  STATE=$(curl -s http://localhost:8000/api/status | python3 -c "import sys,json; print(json.load(sys.stdin)['current_state'])")
  echo "$(date +%H:%M:%S) — $STATE"
  [ "$STATE" = "PROPOSAL_READY" ] && break
  sleep 4
done
```

**Expected `data/proposals/pending.json` after regeneration:** `constraints_applied` field is non-null. All experiments have `concentration_mg_ml <= 0.3`.

**Confirm 409 — regenerate without constraints:**
```bash
# Reset to PROPOSAL_READY first by approving, then simulate, then try regenerate before sending constraint
# (Shortcut: manually edit state.json to set latest_constraints to null and state to PROPOSAL_READY)
curl -s -X POST http://localhost:8000/api/regenerate
```
Expected: `{"detail":"Cannot regenerate: no constraints set. Send a constraint message in chat first."}`

---

### Check 8 — Approve batch

```bash
curl -s -X POST http://localhost:8000/api/approve
```

**Expected response:**
```json
{"status":"approved"}
```

**Expected `state.json` after background task completes:**
```json
{
  "current_state": "RUNNING",
  "current_batch_id": "B3",
  "pending_proposal_id": null,
  "chat_history": [],
  "latest_analysis": null,
  "latest_constraints": null,
  "image_urls": null
}
```

**Expected `data/batches/batch_B3.json`:** Exists, `status: "pending"`, 20 experiments with no `transfection_rate` or `cell_viability`.

**Confirm 409 — approve while EDITING:**
```bash
# First get to EDITING state (send constraint message), then:
curl -s -X POST http://localhost:8000/api/approve
```
Expected: `{"detail":"Cannot approve: current state is EDITING. Regenerate or continue to PROPOSAL_READY first."}`

---

### Check 9 — Batch data endpoints

```bash
# All batches summary
curl -s http://localhost:8000/api/batches | python3 -m json.tool
```
Expected: JSON array with B1 (`best: 0.64, mean: 0.47`) and B2 (`best: 0.84, mean: 0.71`).

```bash
# Specific batch
curl -s http://localhost:8000/api/batch/B2 | python3 -m json.tool | head -30
```
Expected: Full batch with 20 experiments.

```bash
# 404 for missing batch
curl -s http://localhost:8000/api/batch/B99
```
Expected: `{"detail":"Batch B99 not found"}`

---

## 9. Railway Deploy Checklist

Complete these steps in order after the local verification checklist passes.

**Step 1 — Verify repo structure**

The Railway service must have its root directory set to `backend/`. Confirm these files exist:
```
backend/
├── main.py
├── requirements.txt
├── Procfile                  ← web: uvicorn main:app --host 0.0.0.0 --port $PORT
├── runtime.txt               ← python-3.11.9
├── data/
│   ├── state.json
│   ├── batches/
│   │   ├── batch_B1.json
│   │   └── batch_B2.json
│   └── proposals/
└── static/
    └── images/
        ├── positive_1.png ... (6 files)
```

**Step 2 — Push to GitHub**

```bash
git add backend/
git commit -m "add LabMind backend"
git push origin main
```

**Step 3 — Create Railway service**

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select your repo
3. Railway auto-detects the `Procfile`; set **Root Directory** to `backend/`
4. Service type: **Web Service** (not serverless — the demo requires a persistent process)

**Step 4 — Set Railway environment variables**

In Railway dashboard → Service → Variables, add:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (your real key) |
| `FRONTEND_URL` | `https://your-labmind.vercel.app` (set after Vercel deploy; update this) |
| `DATA_DIR` | `./data` |

Railway automatically sets `PORT` — do not set it manually.

**Step 5 — Configure health check**

In Railway dashboard → Service → Settings → Health Check:
- Path: `/health`
- Timeout: `30s`

**Step 6 — Trigger deploy and confirm health check passes**

```bash
# After Railway deploys, get the Railway URL from the dashboard (e.g. labmind-api.up.railway.app)
RAILWAY_URL=https://labmind-api.up.railway.app

curl "$RAILWAY_URL/health"
# Expected: {"status":"ok"}

curl "$RAILWAY_URL/api/status"
# Expected: current_state = "RUNNING" (from seeded data)
```

**Step 7 — Confirm CORS works from Vercel**

After deploying the frontend to Vercel:
```bash
VERCEL_URL=https://your-labmind.vercel.app
RAILWAY_URL=https://labmind-api.up.railway.app

curl -H "Origin: $VERCEL_URL" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     "$RAILWAY_URL/api/simulate" -v 2>&1 | grep "Access-Control"
```
Expected: `Access-Control-Allow-Origin: https://your-labmind.vercel.app`

If CORS fails: update `FRONTEND_URL` in Railway Variables to the exact Vercel URL (no trailing slash) and redeploy.

**Step 8 — Important: Railway filesystem is ephemeral**

Railway destroys `data/` on every redeploy. This means `state.json` and all generated batch files reset to the seeded state after each deploy. This is acceptable for a demo. If persistence is required in future, replace the file store with a Railway-managed PostgreSQL or Redis instance.

---

## 10. Known Gotchas

### G1 — `asyncio.to_thread()` is required for all synchronous calls in background tasks

FastAPI's `BackgroundTasks` runs in the same async event loop as request handlers. Any blocking synchronous call (the LangChain agent, Anthropic SDK calls, scipy LHS sampling) will block the event loop and prevent the `/api/status` polling endpoint from responding while the analysis runs.

**Rule:** Every synchronous function called inside `run_agent_loop`, `run_regeneration`, or `finalize_approval` must be wrapped with `await asyncio.to_thread(fn, *args)`.

**Affected calls:**
```python
# Correct:
result = await asyncio.to_thread(agent.run_analysis_loop, batch_id)
experiments = await asyncio.to_thread(generate_next_batch_impl, top_performer, constraints, pending_id)
new_analysis = await asyncio.to_thread(_rewrite_analysis_with_constraints, ...)

# Also correct (already async-safe since it only reads files):
batch_data = await asyncio.to_thread(load_batch_results_impl, batch_id)
```

The `agent.chat()` call in the `chat_endpoint` is also synchronous LangChain code and must be wrapped: `reply = await asyncio.to_thread(agent.chat, body.message)`.

---

### G2 — File locking only protects within a single process instance

`StateManager` uses `threading.Lock()`. The lock is per-Python-object instance. Two separate `StateManager` instances (e.g., the one in `main.py` and the one created inside `generate_next_batch_impl` in `tools.py`) have different lock objects. This means there is no mutual exclusion between them at the Python level.

**Practical impact:** `generate_next_batch_impl` creates its own `StateManager` instance to write `pending.json`. If `main.py`'s state_manager is simultaneously reading `state.json`, there is no lock contention. This is acceptable for single-process deployment (Railway single instance). Do not run multiple Railway replicas without a proper external lock.

**Mitigation already in architecture:** Background tasks are fired one at a time (the state machine ensures only one background task runs at a time — you can't trigger `run_agent_loop` while `ANALYZING` is in progress).

---

### G3 — numpy float serialization from scipy output

`scipy.stats.qmc.LatinHypercube` returns `numpy.float64` values. When `generate_next_batch_impl` calls `json.dumps(experiments)` (inside `_tool_generate_next_batch` wrapper), Python's `json` module does not natively serialize `numpy.float64`.

**Fix:** The architecture already applies explicit Python type conversions in the loop:
```python
ph   = round(float(row[0]), 2)   # float(numpy.float64) → Python float
temp = int(round(float(row[1]))) # → Python int
```
This converts all values before they enter the dict. **Do not skip these conversions or use `.item()` shorthand** — both approaches work but the `float()` / `int()` casts are already present in the spec and must be kept.

If you ever see `TypeError: Object of type float64 is not JSON serializable`, add a custom JSON encoder as a fallback:
```python
import numpy as np
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        return super().default(obj)
# Usage: json.dumps(data, cls=NumpyEncoder)
```

---

### G4 — LangChain ReAct agent output parsing failures

`create_react_agent` uses text-based ReAct format (not Claude's native function calling). Claude will sometimes respond in ways the ReAct parser cannot interpret — e.g., wrapping the final answer in markdown, including reasoning before the JSON, or using a slightly different format.

**Mitigations already in the architecture:**
- `handle_parsing_errors=True` in `AgentExecutor` — converts parsing errors into tool observations so the agent can try again
- `max_iterations=10` — gives the agent 10 tool calls to complete the task
- The retry loop in `run_analysis_loop` — 3 attempts at prompting the agent to correct its output format
- `_parse_analysis_output` strips markdown code fences before JSON parsing

**What to do if the agent consistently fails to produce valid JSON:** Consider switching to `create_tool_calling_agent` (from `langchain.agents`) which uses Claude's native function calling and is more reliable with Claude models. The prompt template would need adjustment (remove `agent_scratchpad` MessagesPlaceholder, use `create_tool_calling_agent`'s expected format). This is not in the current architecture spec but is the recommended upgrade path if parsing failures are frequent.

---

### G5 — `_next_batch_id` defined in two places

`_next_batch_id` is defined in `main.py` (per architecture spec) but is also called in `agent.py`'s `run_analysis_loop`. Since `agent.py` cannot import from `main.py` without creating a circular import, you must define `_next_batch_id` independently in both files. The implementations are identical:

```python
# Define this in BOTH main.py and agent.py:
def _next_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n + 1}"
```

Alternatively, extract it to a `utils.py` module and import from both. Either approach is correct.

---

### G6 — `_prev_batch_id` is referenced but not defined in the architecture

`generate_next_batch_impl` in `tools.py` references `_prev_batch_id(batch_id)` to set `source_batch_id` in the proposal dict. This function is not defined anywhere in the architecture. Define it in `tools.py`:

```python
def _prev_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n - 1}"
```

---

### G7 — `generate_next_batch_impl` double-writes `pending.json`

`generate_next_batch_impl` writes `pending.json` as a side effect (per architecture spec Section 7.3). When called from `run_regeneration` in `main.py`, the flow is:

1. `generate_next_batch_impl` writes `pending.json` (version A — without `generated_at`)
2. `run_regeneration` immediately overwrites `pending.json` (version B — with correct `generated_at`, `constraints_applied`, etc.)

This is intentional: version B wins. The write inside `generate_next_batch_impl` is benign since it is immediately overwritten. However, when called from the LangChain tool (inside `run_agent_loop`), version A is the final write and must be correct. Confirm the proposal written by the tool has the expected structure before `state_manager.set_state("PROPOSAL_READY")` is called.

---

### G8 — `DATA_DIR` env var vs hardcoded path in tools.py

The `data_dir="data"` string inside `generate_next_batch_impl` must resolve relative to the CWD when the process starts. On Railway, the CWD is `backend/` (Railway runs from the root directory setting). Locally with `uvicorn main:app` from inside `backend/`, this also works.

If you run uvicorn from the repo root (`LabMind/`), `data_dir="data"` would resolve to `LabMind/data/` instead of `LabMind/backend/data/`. Always start the server from inside `backend/`, or use `DATA_DIR=./data` in `.env` and read `os.environ.get("DATA_DIR", "data")` at the top of `tools.py`.

---

### G9 — `ConversationBufferMemory` does not persist across server restarts

The agent's `ConversationBufferMemory` is in-process. If uvicorn restarts (Railway redeploy, crash, etc.), the agent memory is lost. The chat history stored in `state.json` via `state_manager.append_chat_message()` persists on disk, but it is **not** re-loaded into `ConversationBufferMemory` on startup. The agent will lose context of prior turns after a restart.

This is noted as acceptable for MVP demo context (per architecture Section 6.6). If mid-session persistence is required, seed the `ConversationBufferMemory` from `state.json` on `LabMindAgent.__init__` — but this is out of scope for the current spec.

---

### G10 — `StaticFiles` mount must come after route registrations

FastAPI processes middleware and routes in registration order. If `app.mount("/static", ...)` is registered before your API routes, FastAPI may attempt to serve all `/api/*` paths from the static directory and return 404s.

**Always register routes first, then mount static:**
```python
# 1. Register all @app.get/@app.post routes
# 2. THEN mount static files:
app.mount("/static", StaticFiles(directory="static"), name="static")
```

---

*End of backend_implementation.md — all information needed to build and deploy the LabMind backend without any other reference.*
