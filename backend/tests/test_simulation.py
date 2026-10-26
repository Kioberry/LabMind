import numpy as np
import pytest

import simulation as sim
from tools import PARAM_BOUNDS, PARAM_KEYS


def test_optimum_is_inside_bounds_and_on_the_proposable_grid():
    for k in PARAM_KEYS:
        lo, hi = PARAM_BOUNDS[k]
        assert lo <= sim.OPTIMUM_PARAMS[k] <= hi
    assert float(sim.OPTIMUM_PARAMS["temperature_c"]).is_integer()
    assert float(sim.OPTIMUM_PARAMS["incubation_hours"]).is_integer()
    assert sim.OPTIMUM_PARAMS["lipid_ratio_numeric"] in (2.0, 3.0, 4.0)


def test_optimum_beats_dense_random_search():
    rng = np.random.default_rng(0)
    lo = [PARAM_BOUNDS[k][0] for k in PARAM_KEYS]
    hi = [PARAM_BOUNDS[k][1] for k in PARAM_KEYS]
    xs = rng.uniform(lo, hi, size=(20000, 5))
    best = max(sim.true_transfection_rate(dict(zip(PARAM_KEYS, x))) for x in xs)
    assert best <= sim.OPTIMUM_VALUE


def test_secondary_peak_is_a_local_not_global_optimum():
    decoy = sim.true_transfection_rate(sim.SECONDARY_PEAK["center"])
    assert sim.FLOOR < decoy < sim.OPTIMUM_VALUE


def test_accepts_api_shape_and_numeric_shape():
    api = {"pH": 7.4, "temperature_c": 37, "concentration_mg_ml": 0.3,
           "lipid_ratio": "3:1", "incubation_hours": 5}
    assert sim.true_transfection_rate(api) == pytest.approx(sim.OPTIMUM_VALUE)


def test_noise_is_unbiased_and_output_clipped():
    rng = np.random.default_rng(1)
    vals = [sim.simulated_transfection_rate(sim.OPTIMUM_PARAMS, rng) for _ in range(4000)]
    assert np.mean(vals) == pytest.approx(sim.OPTIMUM_VALUE, abs=0.005)
    assert np.std(vals) == pytest.approx(sim.NOISE_SD, rel=0.1)
    assert all(0.0 <= v <= 1.0 for v in vals)
    assert sim.simulated_transfection_rate(sim.OPTIMUM_PARAMS, None) == sim.OPTIMUM_VALUE


def test_simulate_experiment_is_deterministic_per_batch_and_exp():
    p = sim.OPTIMUM_PARAMS
    a = sim.simulate_experiment(p, "EXP-B2-01", "B2")
    b = sim.simulate_experiment(p, "EXP-B2-01", "B2")
    c = sim.simulate_experiment(p, "EXP-B2-02", "B2")
    assert a == b
    assert a["transfection_rate"] != c["transfection_rate"]
    assert a["source"] == "simulation"


def test_objective_mode_env(monkeypatch):
    monkeypatch.delenv("OBJECTIVE_MODE", raising=False)
    assert sim.get_objective_mode() == "image"
    monkeypatch.setenv("OBJECTIVE_MODE", "Simulation")
    assert sim.get_objective_mode() == "simulation"
    monkeypatch.setenv("OBJECTIVE_MODE", "bogus")
    with pytest.raises(ValueError):
        sim.get_objective_mode()
