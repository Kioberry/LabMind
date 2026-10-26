import json
from pathlib import Path

from baselines import random_lhs_batch
from tools import (N_CANDIDATES, PARAM_BOUNDS, SAMPLING_RADIUS_FRACTION,
                   propose_candidates)

TOP = {
    "exp_id": "EXP-B1-07",
    "parameters": {"pH": 7.0, "temperature_c": 37, "concentration_mg_ml": 0.3,
                   "lipid_ratio": "3:1", "incubation_hours": 5},
    "transfection_rate": 0.2,
}


def _numeric(p):
    return {"pH": p["pH"], "temperature_c": p["temperature_c"],
            "concentration_mg_ml": p["concentration_mg_ml"],
            "lipid_ratio_numeric": float(p["lipid_ratio"].split(":")[0]),
            "incubation_hours": p["incubation_hours"]}


def _assert_in_global_bounds(exps):
    for e in exps:
        for k, v in _numeric(e["parameters"]).items():
            lo, hi = PARAM_BOUNDS[k]
            assert lo <= v <= hi, (k, v)


def test_propose_candidates_stays_near_top_performer():
    exps = propose_candidates(TOP, "B2", seed=3)
    assert len(exps) == N_CANDIDATES
    _assert_in_global_bounds(exps)
    center = _numeric(TOP["parameters"])
    for e in exps:
        for k, v in _numeric(e["parameters"]).items():
            lo, hi = PARAM_BOUNDS[k]
            # half-width of the box, plus up to 0.5 for integer rounding of °C / hours / ratio
            assert abs(v - center[k]) <= (hi - lo) * SAMPLING_RADIUS_FRACTION + 0.5 + 1e-9


def test_propose_candidates_default_seed_is_deterministic_and_ids_match_batch():
    a = propose_candidates(TOP, "B3")
    b = propose_candidates(TOP, "B3")
    assert a == b
    assert a[0]["exp_id"] == "EXP-B3-01"
    assert propose_candidates(TOP, "B3", seed=1) != propose_candidates(TOP, "B3", seed=2)


def test_propose_candidates_works_on_real_batch_record():
    batch = json.loads(Path("data/batches/batch_B1.json").read_text())
    top = max(batch["experiments"], key=lambda e: e["transfection_rate"])
    _assert_in_global_bounds(propose_candidates(top, "B2"))


def test_random_baseline_covers_full_space_and_is_seeded():
    exps = random_lhs_batch("B1", seed=0)
    assert len(exps) == N_CANDIDATES
    _assert_in_global_bounds(exps)
    ph = [e["parameters"]["pH"] for e in exps]
    # LHS puts exactly one sample in each of 20 strata, so it spans nearly the whole range
    assert min(ph) < 6.1 and max(ph) > 7.9
    assert random_lhs_batch("B1", seed=0) == exps
    assert random_lhs_batch("B1", seed=1) != exps
