"""
Baselines for evaluating LabMind's optimizer.

random_lhs_batch: Latin Hypercube sample over the FULL parameter space, ignoring all
previous results. Same budget (N_CANDIDATES per batch) and same rounding to the lab
grid as the optimizer, so the only difference is whether past results are used.
"""
from scipy.stats import qmc

from tools import PARAM_BOUNDS, PARAM_KEYS, N_CANDIDATES, _row_to_params


def random_lhs_batch(batch_id: str, seed: int, n: int = N_CANDIDATES) -> list[dict]:
    l_bounds = [PARAM_BOUNDS[k][0] for k in PARAM_KEYS]
    u_bounds = [PARAM_BOUNDS[k][1] for k in PARAM_KEYS]
    sampler = qmc.LatinHypercube(d=len(PARAM_KEYS), seed=seed)
    scaled = qmc.scale(sampler.random(n=n), l_bounds, u_bounds)
    return [
        {"exp_id": f"EXP-{batch_id}-{i + 1:02d}", "parameters": _row_to_params(row)}
        for i, row in enumerate(scaled)
    ]
