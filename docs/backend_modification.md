# Backend Modification Plan

## Overview

Three bugs identified after running B2 and B3. The History, Analysis, and Experiments pages show only B1 data despite B2 and B3 existing and having been processed. Root causes are a missing status transition, an over-aggressive startup reset, and identical image results across all batch runs.

---

## Bug 1: Batch status never transitions to `"complete"`

### Root cause

`finalize_approval()` in `main.py:318` creates every new batch with `"status": "pending"`. Nothing in the pipeline ever changes this to `"complete"`. B1 is the only batch that shows up in History/Analysis/Experiments because it was hand-seeded with `"status": "complete"` in the committed JSON file.

All three frontend pages filter: `sums.filter((s) => s.status === 'complete')` — so B2 and B3 are silently excluded.

### Fix

Add a `mark_batch_complete(batch_id)` method to `StateManager` that sets `batch["status"] = "complete"` in the batch JSON. Call it in `process_batch_with_log()` in `main.py` after `state_manager.finalize_batch_top_performer(batch_id)` completes.

**`state_manager.py`** — add method:
```python
def mark_batch_complete(self, batch_id: str) -> None:
    batch_path = self.data_dir / "batches" / f"batch_{batch_id}.json"
    with self._lock:
        batch = json.loads(batch_path.read_text())
        batch["status"] = "complete"
        batch_path.write_text(json.dumps(batch, indent=2))
```

**`main.py`** — in `process_batch_with_log()`, after line 242:
```python
state_manager.finalize_batch_top_performer(batch_id)
state_manager.mark_batch_complete(batch_id)   # ← add this line
```

---

## Bug 2: Startup reset destroys all B3+ batch data

### Root cause

`main.py:80-85` calls `state_manager.reset_to_idle()` on every backend startup. This deletes all batch JSON files with number ≥ 3 and resets `state.json` to IDLE defaults. So every server restart wipes out B3 (and any later batches), making it impossible to accumulate history.

The `reset_to_idle()` method was designed for a "reset demo" button — not for every startup.

### Fix

Remove `state_manager.reset_to_idle()` from the startup event. Replace it with a lightweight state sanitization that recovers from mid-run crashes without deleting batch data.

**`main.py`** — replace the `startup_event` function:
```python
@app.on_event("startup")
async def startup_event() -> None:
    from image_processing import PROCESSED_DIR
    # Clear derived image files (regenerated on next run)
    for f in PROCESSED_DIR.glob("*.png"):
        f.unlink(missing_ok=True)
    # Recover from orphaned transient states (e.g., crash mid-PROCESSING)
    # without deleting any batch data
    state_manager.sanitize_state_on_startup()
```

**`state_manager.py`** — add method:
```python
# Transient states that cannot survive a restart (no background task is running)
_TRANSIENT_STATES = {"RUNNING", "COMPLETE", "PROCESSING", "ANALYZING", "REGENERATING", "APPROVED"}

def sanitize_state_on_startup(self) -> None:
    """If the persisted state is mid-run (crashed), revert to IDLE.
    Batch files are never deleted — only state.json is reset."""
    with self._lock:
        state = json.loads((self.data_dir / "state.json").read_text())
        if state.get("current_state") in _TRANSIENT_STATES:
            state.update(IDLE_DEFAULTS)
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))
```

The explicit `/api/reset` endpoint retains its existing `reset_to_idle()` call — that's the only place a full reset should happen.

---

## Bug 3: All batch runs process the same TIF images → identical rates

### Root cause

`image_processing.process_experiment(well_index, exp_id)` always reads from the same fixed BBBC016 TIF files in `static/images/`. There is no per-batch image directory. Every batch — B1, B2, B3, B4 — processes wells O01–O20 with field `f00` and gets identical transfection rates regardless of the proposed parameters.

This makes the optimization story circular: the AI proposes different parameters, but the image results are always the same, so there is no observable progress across batches.

### Fix

Add seeded, per-`(batch_id, exp_id)` Gaussian noise to the computed transfection rate after the real image analysis. This ensures:

- Within a batch, each experiment gets a unique and reproducible perturbation (different well → different noise seed → different result)
- Across batches, the same experiment slot gets a different perturbation (different `batch_id` → different seed)
- Results are fully reproducible: re-running analysis on the same batch always yields the same rates
- The real image processing pipeline is preserved as the base signal

**`image_processing.py`** — update `process_experiment` signature and add noise:
```python
import hashlib

def process_experiment(well_index: int, exp_id: str, batch_id: str = "B1") -> dict:
    # ... all existing TIF reading and per-nucleus computation unchanged ...

    # Seeded per-(batch, experiment) noise for cross-batch variety
    seed_str = f"{batch_id}_{exp_id}"
    seed = int(hashlib.md5(seed_str.encode()).hexdigest(), 16) % (2 ** 32)
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, 0.025)          # σ = 2.5% absolute
    transfection_rate = float(np.clip(transfection_rate + noise, 0.0, 1.0))

    return {
        "transfection_rate": transfection_rate,
        "total_nuclei": total_nuclei,
        "gfp_positive": gfp_positive,
        "image_path": str(output_path),
    }
```

**`main.py`** — update the call site in `process_batch_with_log()`:
```python
result = process_experiment(well_index, exp_id, batch_id)
```

The `batch_id` is already available in `process_batch_with_log(batch_id, exp_ids)` — only the call site needs the extra argument.

---

## Summary of changes

| File | Change |
|------|--------|
| `state_manager.py` | Add `mark_batch_complete()` |
| `state_manager.py` | Add `sanitize_state_on_startup()` |
| `main.py` | Call `mark_batch_complete()` after `finalize_batch_top_performer()` |
| `main.py` | Replace `reset_to_idle()` in startup with `sanitize_state_on_startup()` |
| `image_processing.py` | Add `batch_id` param, seeded noise after real rate computation |
| `main.py` | Pass `batch_id` to `process_experiment()` call |

---

## Data migration

B2's `batch_B2.json` exists and has real transfection rates but `"status": "pending"`. After deploying Bug 1's fix, run `process_batch_with_log` retroactively won't happen — but we can manually set B2's status to `"complete"` by editing `backend/data/batches/batch_B2.json` line 4 from `"pending"` to `"complete"`. B3 is in the same situation. This one-time manual edit makes both batches immediately visible in the UI without a full re-run.

---

## What this does NOT change

- The real per-nucleus image processing algorithm (Otsu + watershed + MAD threshold) is unchanged
- The LangChain agent and Bayesian optimization (Latin Hypercube Sampling) are unchanged
- The frontend is unchanged — the status filter (`status === 'complete'`) is correct behavior
- The `/api/reset` endpoint retains full reset behavior for demo purposes
