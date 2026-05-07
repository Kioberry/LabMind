import json
import os
import statistics
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.stats import qmc
from langchain.tools import Tool

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))

PARAM_BOUNDS = {
    "pH":                  (6.0,  8.0),
    "temperature_c":       (35.0, 42.0),
    "concentration_mg_ml": (0.1,  0.5),
    "lipid_ratio_numeric": (2.0,  4.0),
    "incubation_hours":    (2.0,  8.0),
}
PARAM_KEYS = ["pH", "temperature_c", "concentration_mg_ml", "lipid_ratio_numeric", "incubation_hours"]
N_CANDIDATES = 20
SAMPLING_RADIUS_FRACTION = 0.25


def _prev_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n - 1}"


def _get_sampling_bounds(top_performer: dict) -> tuple[list[float], list[float]]:
    params = top_performer["parameters"]
    lr_numeric = float(params["lipid_ratio"].split(":")[0])
    center_values = {
        "pH":                  params["pH"],
        "temperature_c":       float(params["temperature_c"]),
        "concentration_mg_ml": params["concentration_mg_ml"],
        "lipid_ratio_numeric": lr_numeric,
        "incubation_hours":    float(params["incubation_hours"]),
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


def _apply_constraints_via_claude(experiments: list[dict], constraints: str) -> list[dict]:
    import anthropic

    client = anthropic.Anthropic()
    prompt = f"""You are helping filter and adjust experiment parameters for an mRNA-LNP optimization study.

The researcher has specified the following constraint:
"{constraints}"

Here are {len(experiments)} proposed experiment parameter sets:
{json.dumps(experiments, indent=2)}

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
    return json.loads(content[start:end])


def load_batch_results_impl(batch_id: str) -> dict:
    path = DATA_DIR / "batches" / f"batch_{batch_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Batch file not found: {path}")
    return json.loads(path.read_text())


def find_top_performer_impl(experiments: list[dict]) -> dict:
    ranked = sorted(experiments, key=lambda e: e["transfection_rate"], reverse=True)
    top = ranked[0]
    baseline = ranked[-1]
    rates = [e["transfection_rate"] for e in experiments]
    return {
        "top_experiment": top,
        "baseline_exp_id": baseline["exp_id"],
        "batch_mean": round(statistics.mean(rates), 4),
        "batch_std": round(statistics.stdev(rates), 4),
        "top_transfection_rate": top["transfection_rate"],
    }


def get_comparison_images_impl(top_exp_id: str, batch_id: str, baseline_exp_id: str) -> dict:
    return {
        "optimal": f"/static/images/processed/{top_exp_id}_gfp.png",
        "baseline": f"/static/images/processed/{baseline_exp_id}_gfp.png",
    }


def generate_next_batch_impl(top_performer: dict, constraints: str | None, batch_id: str) -> list[dict]:
    from state_manager import StateManager

    l_bounds, u_bounds = _get_sampling_bounds(top_performer)

    seed = sum(ord(c) for c in batch_id) % (2 ** 31)
    sampler = qmc.LatinHypercube(d=5, seed=seed)
    unit_sample = sampler.random(n=N_CANDIDATES)
    scaled = qmc.scale(unit_sample, l_bounds, u_bounds)

    experiments = []
    for i, row in enumerate(scaled):
        ph     = round(float(row[0]), 2)
        temp   = int(round(float(row[1])))
        conc   = round(float(row[2]), 3)
        lr_int = max(2, min(4, int(round(float(row[3])))))
        lr_str = f"{lr_int}:1"
        hours  = int(round(float(row[4])))

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

    state_manager = StateManager(data_dir=str(DATA_DIR))
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


# --- LangChain Tool wrappers ---

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


def _tool_get_comparison_images(input_str: str) -> str:
    try:
        data = json.loads(input_str)
        result = get_comparison_images_impl(
            top_exp_id=data["top_exp_id"],
            batch_id=data["batch_id"],
            baseline_exp_id=data["baseline_exp_id"],
        )
        return json.dumps(result)
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
    description=(
        "Get fluorescence microscopy image URLs for visualization. "
        "Input: JSON with keys 'top_exp_id' (string, the top experiment's exp_id), "
        "'batch_id' (string, current batch ID), "
        "'baseline_exp_id' (string, the baseline experiment's exp_id — use the baseline_exp_id "
        "returned by find_top_performer). Returns optimal and baseline image URLs."
    ),
    func=_tool_get_comparison_images,
)
