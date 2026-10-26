import numpy as np
import pytest

import evaluate as ev
from simulation import OPTIMUM_VALUE


def test_run_campaign_shapes_and_monotone_best():
    r = ev.run_campaign("labmind", seed=0, n_batches=4)
    for key in ("best_true", "simple_regret", "best_observed", "batch_mean_true"):
        assert len(r[key]) == 4
    assert len(r["proposal_seconds"]) == 3
    assert all(b2 >= b1 for b1, b2 in zip(r["best_true"], r["best_true"][1:]))
    assert all(0.0 <= g <= OPTIMUM_VALUE for g in r["simple_regret"])


def test_both_methods_share_the_initial_batch():
    lab = ev.run_campaign("labmind", seed=5, n_batches=2, noise_sd=0.0)
    rnd = ev.run_campaign("random", seed=5, n_batches=2, noise_sd=0.0)
    assert lab["best_true"][0] == rnd["best_true"][0]


def test_without_noise_regret_equals_gap_to_best_true():
    r = ev.run_campaign("random", seed=2, n_batches=3, noise_sd=0.0)
    for best, reg in zip(r["best_true"], r["simple_regret"]):
        assert reg == pytest.approx(OPTIMUM_VALUE - best)


def test_unknown_method_rejected():
    with pytest.raises(ValueError):
        ev.run_campaign("grid", seed=0)


def test_batches_to_threshold():
    target = 0.9 * OPTIMUM_VALUE
    assert ev.batches_to_threshold([0.1, target - 1e-6, target, 0.8], 0.9) == 3
    assert ev.batches_to_threshold([0.1, 0.2], 0.9) is None


def test_summarize_matches_t_interval():
    s = ev.summarize([1.0, 2.0, 3.0, 4.0])
    assert s["mean"] == 2.5
    assert s["std"] == pytest.approx(np.std([1, 2, 3, 4], ddof=1))
    # t(0.975, df=3) = 3.182446
    half = 3.182446 * s["std"] / 2
    assert s["ci95"] == pytest.approx([2.5 - half, 2.5 + half], rel=1e-5)


def test_evaluate_report_structure_small():
    res = ev.evaluate(n_seeds=3, n_batches=2)
    assert set(res["methods"]) == {"labmind", "random"}
    assert len(res["methods"]["labmind"]["simple_regret_per_batch"]) == 2
    assert "Paired final regret" in ev.format_table(res)
