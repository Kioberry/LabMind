import importlib

import pytest


@pytest.fixture
def main_module(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-used")  # agent is constructed, never called
    import main
    return importlib.reload(main)


def test_simulation_mode_scores_from_parameters(main_module):
    exp = {"exp_id": "EXP-B2-01",
           "parameters": {"pH": 7.4, "temperature_c": 37, "concentration_mg_ml": 0.3,
                          "lipid_ratio": "3:1", "incubation_hours": 5}}
    result, log_line = main_module._measure_experiment(1, exp, "B2", "simulation")
    assert result["source"] == "simulation"
    assert result["true_transfection_rate"] > 0.8
    assert "[simulated objective]" in log_line
    assert result["gfp_png_path"].endswith("EXP-B2-01_gfp.png")


def test_record_timing_persists_to_state(main_module):
    main_module._record_timing("B1", "measurement_seconds", 1.23456, mode="image")
    main_module._record_timing("B1", "agent_decision_seconds", 9.5)
    t = main_module.state_manager.get_state()["timings"]["B1"]
    assert t == {"measurement_seconds": 1.2346, "mode": "image", "agent_decision_seconds": 9.5}
