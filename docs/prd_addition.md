# LabMind — PRD Addition: Real TIF Image Processing

**Version:** 1.1  
**Status:** Ready for Implementation  
**Extends:** PRD v1.0 + software-architecture.md  
**Scope:** Replaces simulated transfection data with real image-derived measurements from BBBC016 TIF files.

---

## 1. Motivation

The current system uses hardcoded `transfection_rate` values in batch JSON files and selects visualization images from 6 static placeholder PNGs. This addition makes both real: transfection rates are computed from fluorescence microscopy TIF images, and the images shown in the dashboard are the actual processed GFP-channel outputs. The simulation assumption is that an upstream agent pipeline has already acquired TIF files from the microscope and deposited them into `backend/static/images/`. LabMind reads from that folder — no researcher upload step, no UI change for ingestion.

---

## 2. TIF Dataset — BBBC016 Naming Convention

All TIF files follow this pattern:

```
AS_09047_050428030001_O{well}f{field}d{channel}.TIF
```

| Segment | Values | Meaning |
|---|---|---|
| `O{well}` | `O01`–`O24` | Well ID — maps to one experiment |
| `f{field}` | `f00`, `f01`, `f02` | Field of view within the well |
| `d{channel}` | `d0`, `d2` | `d0` = Hoechst (nuclear stain, Channel 1), `d2` = GFP (transfection marker, Channel 2) |

**Mapping to experiments:** Each well (`O01`–`O20`) maps to one experiment in a 20-experiment batch. Field `f00` is used as the representative field of view per experiment. Wells `O21`–`O24` are held in reserve (can be used for baseline reference images).

**Experiment → TIF mapping example (Batch B2):**

| Experiment | Hoechst TIF | GFP TIF |
|---|---|---|
| EXP-B2-01 | `...O01f00d0.TIF` | `...O01f00d2.TIF` |
| EXP-B2-02 | `...O02f00d0.TIF` | `...O02f00d2.TIF` |
| ... | ... | ... |
| EXP-B2-20 | `...O20f00d0.TIF` | `...O20f00d2.TIF` |

The mapping is deterministic: well index = experiment number within the batch. The prefix `AS_09047_050428030001_` is constant across all files.

---

## 3. New Module: `image_processing.py`

**Location:** `backend/image_processing.py`

**Dependencies to add to `requirements.txt`:**
```
tifffile
numpy
Pillow
scikit-image
```

**Responsibilities:**
1. Read a pair of TIF files (Hoechst + GFP) for one experiment
2. Perform percentile normalization (p2/p98) on each channel independently → compress to 8-bit
3. Compute `transfection_rate` = GFP+ cell count / total cell count using Otsu thresholding
4. Save the normalized GFP channel as a PNG to `static/images/processed/`
5. Return `transfection_rate` (float, 0.0–1.0) and the saved PNG path

**Core function signatures:**

```python
TIF_PREFIX = "AS_09047_050428030001_"
TIF_DIR = Path("static/images")
PROCESSED_DIR = Path("static/images/processed")

def get_tif_paths(well_index: int) -> tuple[Path, Path]:
    """
    Returns (hoechst_path, gfp_path) for well O{well_index:02d}, field f00.
    well_index is 1-based (1–20).
    """

def normalize_channel(arr: np.ndarray) -> np.ndarray:
    """
    Percentile normalization: clip to [p2, p98], then scale to uint8 [0, 255].
    Input: 2D numpy array (16-bit).
    Output: 2D numpy array (uint8).
    """

def compute_transfection_rate(hoechst_arr: np.ndarray, gfp_arr: np.ndarray) -> float:
    """
    1. Apply Otsu threshold to hoechst_arr → binary mask of all nuclei → total_cells
    2. Apply Otsu threshold to gfp_arr → binary mask of GFP+ cells → gfp_cells
    3. Return gfp_cells / total_cells, clamped to [0.0, 1.0].
    Uses skimage.filters.threshold_otsu + skimage.measure.label for connected-component counting.
    """

def process_experiment(well_index: int, exp_id: str) -> dict:
    """
    Full pipeline for one experiment:
    1. Load both TIF channels
    2. Normalize each to 8-bit
    3. Compute transfection_rate
    4. Save GFP PNG to PROCESSED_DIR / f"{exp_id}_gfp.png"
    5. Return {"transfection_rate": float, "gfp_png_path": str}
    """

def process_batch(batch_id: str, exp_ids: list[str]) -> list[dict]:
    """
    Runs process_experiment for all 20 experiments in a batch sequentially.
    well_index = experiment number (EXP-B2-01 → well 1, EXP-B2-20 → well 20).
    Returns list of {"exp_id": str, "transfection_rate": float, "gfp_png_path": str}
    in the same order as exp_ids.
    """
```

**Output PNG storage:**
```
backend/static/images/processed/
├── EXP-B2-01_gfp.png
├── EXP-B2-02_gfp.png
...
└── EXP-B2-20_gfp.png
```

Served by FastAPI's existing static file mount at `/static/images/processed/EXP-B2-01_gfp.png`.

---

## 4. Changes to `tools.py`

### 4.1 `get_comparison_images_impl` — rewrite

**Old behavior:** Maps `transfection_rate` numeric threshold to one of 6 static placeholder PNGs.

**New behavior:** Returns the actual processed GFP PNG paths for the top performer and baseline experiment.

```python
def get_comparison_images_impl(top_performer: dict, batch_id: str, baseline_exp_id: str) -> dict:
    """
    top_performer: the top experiment dict (has exp_id)
    batch_id: current batch ID (e.g. "B2")
    baseline_exp_id: exp_id of the baseline experiment (lowest transfection_rate in batch,
                     or top performer of the first batch for cross-batch comparison)
    Returns:
    {
        "optimal": "/static/images/processed/{top_exp_id}_gfp.png",
        "baseline": "/static/images/processed/{baseline_exp_id}_gfp.png"
    }
    """
```

The 6 static placeholder PNGs (`positive_1-3.png`, `negative_1-3.png`) are no longer used for this purpose and can be kept as-is or removed.

### 4.2 `GET_COMPARISON_IMAGES_TOOL` — update description

Update the tool description to reflect the new signature so the agent calls it correctly.

### 4.3 `find_top_performer_impl` — minor update

Remove `cell_viability` from all return values and ranking logic (see Section 6).

---

## 5. Changes to `main.py` — Two-Phase Batch Write + Processing Log

### 5.1 New background task: `run_tif_processing`

The current `run_agent_loop` does: `sleep(2)` → COMPLETE → ANALYZING → agent runs.

New flow inserts TIF processing between COMPLETE and ANALYZING:

```
RUNNING → COMPLETE → PROCESSING → ANALYZING → PROPOSAL_READY
```

New state `PROCESSING` is added (see Section 7).

```python
async def run_agent_loop(batch_id: str) -> None:
    await asyncio.sleep(2)
    state_manager.set_state("COMPLETE")
    state_manager.set_state("PROCESSING")

    # Phase 1: TIF processing — computes real transfection_rate for each experiment
    batch_data = state_manager.read_batch(batch_id)
    exp_ids = [e["exp_id"] for e in batch_data["experiments"]]

    results = await asyncio.to_thread(process_batch_with_log, batch_id, exp_ids)
    # process_batch_with_log writes transfection_rate back into batch JSON
    # and appends processing_log entries as it goes

    state_manager.set_state("ANALYZING")

    # Phase 2: Agent analysis (unchanged)
    try:
        result = await asyncio.to_thread(agent.run_analysis_loop, batch_id)
    except Exception as exc:
        logging.error("Agent analysis failed: %s", exc)
        state_manager.update_state({"current_state": "IDLE"})
        return

    next_id = _next_batch_id(batch_id)
    state_manager.update_state({
        "latest_analysis": result["analysis_text"],
        "image_urls": result["image_urls"],
        "pending_proposal_id": next_id,
    })
    state_manager.set_state("PROPOSAL_READY")
```

### 5.2 `process_batch_with_log` — processing with live log updates

```python
def process_batch_with_log(batch_id: str, exp_ids: list[str]) -> list[dict]:
    """
    Wraps image_processing.process_batch but writes a processing_log entry
    to state.json after each experiment completes.
    """
    results = []
    for i, exp_id in enumerate(exp_ids):
        well_index = i + 1
        result = process_experiment(well_index, exp_id)
        results.append({"exp_id": exp_id, **result})

        # Write transfection_rate back into batch JSON immediately
        state_manager.update_experiment_result(
            batch_id, exp_id,
            transfection_rate=result["transfection_rate"]
        )

        # Append natural-language log entry
        rate_pct = round(result["transfection_rate"] * 100, 1)
        state_manager.append_processing_log(
            f"Processed {exp_id}: detected {rate_pct}% GFP+ transfection efficiency"
        )

    top = max(results, key=lambda r: r["transfection_rate"])
    state_manager.append_processing_log(
        f"Image processing complete. Top performer: {top['exp_id']} "
        f"at {round(top['transfection_rate']*100, 1)}% transfection efficiency."
    )
    return results
```

### 5.3 Two-phase batch write

**Phase 1 (at approve time):** `finalize_approval` writes `batch_B{n}.json` with experiment parameters only — `transfection_rate` is set to `null`, `is_top_performer` is set to `false` for all.

**Phase 2 (during PROCESSING):** `state_manager.update_experiment_result()` fills in `transfection_rate` one experiment at a time as TIF processing completes. After all 20 are done, `is_top_performer` is set on the highest-rate experiment.

---

## 6. `cell_viability` Removal

Remove from every layer:

| File | Change |
|---|---|
| `data/batches/batch_B1.json` | Remove `cell_viability` field from all experiments |
| `data/batches/batch_B2.json` | Same |
| `models.py` — `Experiment` | Remove `cell_viability: Optional[float]` |
| `tools.py` — `find_top_performer_impl` | Remove from return dict and any ranking logic |
| `agent.py` — `SYSTEM_PROMPT` | Remove mentions of `cell_viability` |
| Frontend `ExperimentsTable.tsx` | Remove `cell_viability` column |
| Frontend `lib/types.ts` — `Experiment` | Remove `cell_viability` field |

---

## 7. State Machine Addition

Add one new state: `PROCESSING`

| State | Meaning |
|---|---|
| `PROCESSING` | TIF files are being read and analyzed; `transfection_rate` being computed per experiment |

Updated primary flow:
```
RUNNING → COMPLETE → PROCESSING → ANALYZING → PROPOSAL_READY → APPROVED → RUNNING
```

`STATE_ENUM` in `state_manager.py` gains `"PROCESSING"`.

Frontend `page.tsx`: `PROCESSING` is grouped with `RUNNING_STATES` for page routing — it shows the `RunningView` (or a new `ProcessingView`, see Section 8).

---

## 8. `state.json` Schema Additions

Two new fields added to `state.json`:

```json
{
  "current_state": "PROCESSING",
  "processing_log": [
    "Processed EXP-B2-01: detected 84.0% GFP+ transfection efficiency",
    "Processed EXP-B2-02: detected 76.2% GFP+ transfection efficiency",
    "Image processing complete. Top performer: EXP-B2-01 at 84.0% transfection efficiency.",
    "Running scientific analysis with AI agent...",
    "Top performer identified. Generating optimized parameter candidates for B3...",
    "Proposal ready for researcher review."
  ],
  "processing_log_step": "tif_processing"
}
```

| Field | Type | Meaning |
|---|---|---|
| `processing_log` | `list[str]` | Ordered list of natural-language log lines, appended as steps complete |
| `processing_log_step` | `str` | Current high-level phase: `"tif_processing"`, `"analyzing"`, `"complete"` |

`processing_log` is reset to `[]` at the start of each new `run_agent_loop` call.

Log lines are written throughout both phases:
- During PROCESSING: one line per experiment as TIF completes
- During ANALYZING: agent tool call completions appended as natural language (e.g. "Top performer identified. Generating optimized parameter candidates for B3...")

---

## 9. Frontend Changes

### 9.1 `lib/types.ts`

- Remove `cell_viability` from `Experiment`
- Add to `StatusResponse`:
```typescript
processing_log: string[];
processing_log_step: string | null;
```

### 9.2 `ProcessingView` component (new or extend `RunningView`)

Shown when `current_state === 'PROCESSING'` or `current_state === 'ANALYZING'`.

Renders a scrolling log panel styled like a terminal/thinking trace:

```
─ LabMind Agent ──────────────────────────────────
  Processed EXP-B2-01: detected 84.0% GFP+ transfection efficiency
  Processed EXP-B2-02: detected 76.2% GFP+ transfection efficiency
  Processed EXP-B2-03: detected 76.1% GFP+ transfection efficiency
  ...
  Image processing complete. Top performer: EXP-B2-01 at 84.0%.
  Running scientific analysis with AI agent...
  Top performer identified. Generating optimized parameter candidates for B3...
  ● (pulsing dot — current step in progress)
─────────────────────────────────────────────────
```

Design: monospace font, dark background (`#0a0a09`), text in `rgba(255,255,255,0.65)`, completed lines fade in sequentially, the last in-progress line has a pulsing gold dot. Auto-scrolls to bottom as new lines arrive (same pattern as polling every 4s).

### 9.3 `ExperimentsTable.tsx`

Remove `cell_viability` column.

### 9.4 `page.tsx` routing

Add `'PROCESSING'` to `RUNNING_STATES` array so the processing view renders during that state.

---

## 10. `state_manager.py` New Methods

```python
def append_processing_log(self, message: str) -> None:
    """Thread-safe append of one natural-language line to processing_log."""

def reset_processing_log(self) -> None:
    """Clears processing_log to [] and resets processing_log_step. Called at start of each run."""

def update_experiment_result(self, batch_id: str, exp_id: str, transfection_rate: float) -> None:
    """
    Reads batch_{batch_id}.json, finds the experiment by exp_id,
    sets transfection_rate. Thread-safe.
    After all experiments updated, sets is_top_performer=True on the highest-rate one.
    """
```

---

## 11. What Does NOT Change

The following are explicitly unchanged by this addition:

- Agent architecture (`agent.py`) — no changes
- LangChain tool calling pattern — no changes
- Chat, approve, regenerate flows — no changes
- State machine transitions (other than adding PROCESSING) — no changes
- Frontend polling interval (4s) — no changes
- API endpoints (other than `GET /api/status` returning 2 new fields) — no changes
- Deployment configuration — no changes
- Batch JSON schema structure — `transfection_rate` field stays, just populated from TIF now instead of hardcoded

---

## 12. Implementation Order

| Step | Task | Files |
|---|---|---|
| 1 | Remove `cell_viability` everywhere | `models.py`, `batch_B1.json`, `batch_B2.json`, `tools.py`, `agent.py`, `types.ts`, `ExperimentsTable.tsx` |
| 2 | Add `image_processing.py` with full pipeline | `image_processing.py`, `requirements.txt` |
| 3 | Add `processing_log` fields to `state.json` schema and `StateManager` | `state_manager.py`, `state.json` |
| 4 | Add `PROCESSING` state, refactor `run_agent_loop` | `state_manager.py`, `main.py` |
| 5 | Rewrite `get_comparison_images_impl` | `tools.py` |
| 6 | Update agent system prompt for new tool signature | `agent.py` |
| 7 | Add `processing_log` fields to API response types | `models.py`, `types.ts` |
| 8 | Build `ProcessingView` frontend component | `ProcessingView.tsx`, `page.tsx` |

---

*This document extends PRD v1.0. For anything not mentioned here, the original PRD and software-architecture.md remain authoritative.*
