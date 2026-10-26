"""
SIMULATED objective function for offline evaluation of the optimizer.

This is NOT real biology. It is a synthetic response surface with a KNOWN optimum,
so we can measure how close an optimizer gets to the best possible answer (regret).
The real image-based path (image_processing.process_experiment) cannot do that:
its transfection rate depends on the well index plus random noise, not on the
proposed parameters, so no optimizer can improve it.

Shape: a smooth main peak plus a smaller secondary peak (mildly multimodal),
on top of a low floor, with Gaussian measurement noise. The peak locations and
widths are hand-picked to be plausible for an mRNA-LNP screen (near-neutral pH,
~37 °C, mid concentration, 3:1 lipid ratio, mid incubation), not fitted to data.

Select it in the running app with OBJECTIVE_MODE=simulation (default: image).
"""
import hashlib
import math
import os

import numpy as np

OBJECTIVE_MODE_IMAGE = "image"
OBJECTIVE_MODE_SIMULATION = "simulation"

FLOOR = 0.03
NOISE_SD = 0.03

# Main peak: global optimum. Placed on the grid the optimizer can actually propose
# (integer °C, integer hours, n:1 lipid ratio) so it is reachable.
MAIN_PEAK = {
    "height": 0.80,
    "center": {"pH": 7.4, "temperature_c": 37.0, "concentration_mg_ml": 0.30,
               "lipid_ratio_numeric": 3.0, "incubation_hours": 5.0},
}
# Secondary local optimum: a decoy that a purely local search can get stuck on.
SECONDARY_PEAK = {
    "height": 0.45,
    "center": {"pH": 6.4, "temperature_c": 40.0, "concentration_mg_ml": 0.15,
               "lipid_ratio_numeric": 4.0, "incubation_hours": 3.0},
}
# Length scales (1 standard deviation of the Gaussian bump) in natural units.
WIDTHS = {"pH": 0.4, "temperature_c": 1.5, "concentration_mg_ml": 0.08,
          "lipid_ratio_numeric": 0.6, "incubation_hours": 1.5}

PARAM_KEYS = ["pH", "temperature_c", "concentration_mg_ml", "lipid_ratio_numeric", "incubation_hours"]


def get_objective_mode() -> str:
    mode = os.environ.get("OBJECTIVE_MODE", OBJECTIVE_MODE_IMAGE).strip().lower()
    if mode not in (OBJECTIVE_MODE_IMAGE, OBJECTIVE_MODE_SIMULATION):
        raise ValueError(f"Unknown OBJECTIVE_MODE: {mode!r} (expected 'image' or 'simulation')")
    return mode


def _to_numeric(params: dict) -> dict:
    """Accept either the API shape (lipid_ratio '3:1') or the numeric shape (lipid_ratio_numeric)."""
    if "lipid_ratio_numeric" in params:
        lr = float(params["lipid_ratio_numeric"])
    else:
        lr = float(str(params["lipid_ratio"]).split(":")[0])
    return {
        "pH": float(params["pH"]),
        "temperature_c": float(params["temperature_c"]),
        "concentration_mg_ml": float(params["concentration_mg_ml"]),
        "lipid_ratio_numeric": lr,
        "incubation_hours": float(params["incubation_hours"]),
    }


def _bump(x: dict, peak: dict) -> float:
    sq = sum(((x[k] - peak["center"][k]) / WIDTHS[k]) ** 2 for k in PARAM_KEYS)
    return peak["height"] * math.exp(-0.5 * sq)


def true_transfection_rate(params: dict) -> float:
    """Noise-free simulated transfection rate in [0, 1]."""
    x = _to_numeric(params)
    value = FLOOR + _bump(x, MAIN_PEAK) + _bump(x, SECONDARY_PEAK)
    return float(min(1.0, max(0.0, value)))


OPTIMUM_PARAMS = dict(MAIN_PEAK["center"])
OPTIMUM_VALUE = true_transfection_rate(OPTIMUM_PARAMS)


def simulated_transfection_rate(params: dict, rng: np.random.Generator | None = None,
                                noise_sd: float = NOISE_SD) -> float:
    """One noisy 'measurement' of the simulated surface, clipped to [0, 1]."""
    value = true_transfection_rate(params)
    if rng is not None and noise_sd > 0:
        value += rng.normal(0.0, noise_sd)
    return float(np.clip(value, 0.0, 1.0))


def simulate_experiment(params: dict, exp_id: str, batch_id: str) -> dict:
    """
    Drop-in replacement for image_processing.process_experiment's numeric output when
    OBJECTIVE_MODE=simulation. Noise is seeded per (batch, experiment), like the image path.
    """
    seed = int(hashlib.md5(f"sim_{batch_id}_{exp_id}".encode()).hexdigest(), 16) % (2 ** 32)
    rate = simulated_transfection_rate(params, np.random.default_rng(seed))
    return {
        "transfection_rate": rate,
        "true_transfection_rate": true_transfection_rate(params),
        "source": OBJECTIVE_MODE_SIMULATION,
    }
