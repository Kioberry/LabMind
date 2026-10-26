"""
Offline evaluation harness: LabMind optimizer vs. random LHS baseline, IN SIMULATION.

No LLM calls. In the app, Claude decides to call generate_next_batch, but the candidates
themselves come from tools.propose_candidates (LHS around the latest batch's top
performer). This harness calls propose_candidates directly, so it measures the sampling
strategy, not Claude's text or tool-calling reliability.

Protocol (per seed):
  B1      : one random LHS batch over the full space, shared by both methods.
  B2..Bn  : LabMind -> propose_candidates around the top observed experiment of the
            previous batch (exactly what the agent does); Random -> fresh random LHS.
  Scoring : simulation.simulated_transfection_rate (noisy); regret uses the noise-free
            true_transfection_rate, which is only possible because the optimum is known.

Metrics (cumulative after each batch):
  best_true      max true rate among all experiments run so far
  simple_regret  OPTIMUM_VALUE - true rate of the recommended point
                 (recommended = highest OBSERVED rate so far; what a scientist would pick)
  batches_to_threshold  first batch where best_true >= threshold * OPTIMUM_VALUE

Usage (from backend/):
  python evaluate.py --seeds 30 --batches 5 --out ../docs/eval/results.json
"""
import argparse
import json
import platform
import time
from pathlib import Path

import numpy as np
from scipy import stats

from baselines import random_lhs_batch
from simulation import OPTIMUM_VALUE, NOISE_SD, simulated_transfection_rate, true_transfection_rate
from tools import N_CANDIDATES, propose_candidates

METHODS = ("labmind", "random")


def _measure(experiments: list[dict], rng: np.random.Generator, noise_sd: float) -> list[dict]:
    return [
        {
            **e,
            "transfection_rate": simulated_transfection_rate(e["parameters"], rng, noise_sd),
            "true_rate": true_transfection_rate(e["parameters"]),
        }
        for e in experiments
    ]


def run_campaign(method: str, seed: int, n_batches: int = 5, noise_sd: float = NOISE_SD,
                 n_per_batch: int = N_CANDIDATES) -> dict:
    """Run one optimization campaign and return per-batch cumulative metrics + timings."""
    if method not in METHODS:
        raise ValueError(f"Unknown method: {method}")
    # Different noise stream per method, but the same initial design (B1) for both.
    noise_rng = np.random.default_rng([seed, METHODS.index(method)])
    history: list[dict] = []
    batch = random_lhs_batch("B1", seed=seed, n=n_per_batch)
    best_true, regret, best_obs, batch_mean_true, proposal_seconds = [], [], [], [], []

    for b in range(1, n_batches + 1):
        if b > 1:
            batch_id = f"B{b}"
            t0 = time.perf_counter()
            if method == "labmind":
                top = max(last_measured, key=lambda e: e["transfection_rate"])
                batch = propose_candidates(top, batch_id, seed=seed * 1000 + b, n=n_per_batch)
            else:
                batch = random_lhs_batch(batch_id, seed=seed * 1000 + b, n=n_per_batch)
            proposal_seconds.append(time.perf_counter() - t0)
        last_measured = _measure(batch, noise_rng, noise_sd)
        history.extend(last_measured)

        recommended = max(history, key=lambda e: e["transfection_rate"])
        best_true.append(max(e["true_rate"] for e in history))
        regret.append(OPTIMUM_VALUE - recommended["true_rate"])
        best_obs.append(recommended["transfection_rate"])
        batch_mean_true.append(float(np.mean([e["true_rate"] for e in last_measured])))

    return {
        "method": method,
        "seed": seed,
        "best_true": best_true,
        "simple_regret": regret,
        "best_observed": best_obs,
        "batch_mean_true": batch_mean_true,
        "proposal_seconds": proposal_seconds,
    }


def batches_to_threshold(best_true: list[float], threshold: float) -> int | None:
    target = threshold * OPTIMUM_VALUE
    for i, v in enumerate(best_true, start=1):
        if v >= target:
            return i
    return None


def summarize(values) -> dict:
    """Mean, sample std and 95% t confidence interval of the mean."""
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    mean = float(arr.mean())
    std = float(arr.std(ddof=1)) if n > 1 else 0.0
    half = float(stats.t.ppf(0.975, n - 1) * std / np.sqrt(n)) if n > 1 else 0.0
    return {"mean": mean, "std": std, "ci95": [mean - half, mean + half], "n": n}


def evaluate(n_seeds: int = 30, n_batches: int = 5, noise_sd: float = NOISE_SD,
             threshold: float = 0.9, seed_offset: int = 0) -> dict:
    seeds = list(range(seed_offset, seed_offset + n_seeds))
    runs = {m: [run_campaign(m, s, n_batches, noise_sd) for s in seeds] for m in METHODS}

    per_method = {}
    for m, rs in runs.items():
        ttt = [batches_to_threshold(r["best_true"], threshold) for r in rs]
        reached = [t for t in ttt if t is not None]
        per_method[m] = {
            "best_true_per_batch": [summarize([r["best_true"][b] for r in rs]) for b in range(n_batches)],
            "simple_regret_per_batch": [summarize([r["simple_regret"][b] for r in rs]) for b in range(n_batches)],
            "batch_mean_true_per_batch": [summarize([r["batch_mean_true"][b] for r in rs]) for b in range(n_batches)],
            "batches_to_threshold": {
                "reached_fraction": len(reached) / len(rs),
                "per_seed": ttt,
                "mean_if_reached": float(np.mean(reached)) if reached else None,
            },
            "proposal_seconds": summarize([t for r in rs for t in r["proposal_seconds"]]),
        }

    # Paired comparison: same seed -> same B1, so compare final regret seed by seed.
    final_lab = np.array([r["simple_regret"][-1] for r in runs["labmind"]])
    final_rnd = np.array([r["simple_regret"][-1] for r in runs["random"]])
    diff = final_rnd - final_lab  # > 0 means LabMind ended closer to the optimum
    wilcoxon_p = None
    if np.any(diff != 0):
        wilcoxon_p = float(stats.wilcoxon(diff).pvalue)

    return {
        "config": {
            "n_seeds": n_seeds, "seeds": seeds, "n_batches": n_batches,
            "n_per_batch": N_CANDIDATES, "noise_sd": noise_sd, "threshold": threshold,
            "optimum_value": OPTIMUM_VALUE, "objective": "simulation (backend/simulation.py)",
            "python": platform.python_version(),
        },
        "methods": per_method,
        "paired_final_regret_random_minus_labmind": {
            **summarize(diff),
            "labmind_better_fraction": float(np.mean(diff > 0)),
            "wilcoxon_p": wilcoxon_p,
        },
    }


def format_table(result: dict) -> str:
    cfg = result["config"]
    lines = [
        f"Simulation, {cfg['n_seeds']} seeds, {cfg['n_batches']} batches x {cfg['n_per_batch']}, "
        f"noise_sd={cfg['noise_sd']}, optimum={cfg['optimum_value']:.3f}",
        "",
        "| batch | LabMind best_true (95% CI) | Random best_true (95% CI) | LabMind regret (95% CI) | Random regret (95% CI) |",
        "|---|---|---|---|---|",
    ]
    lab, rnd = result["methods"]["labmind"], result["methods"]["random"]

    def cell(s):
        return f"{s['mean']:.3f} [{s['ci95'][0]:.3f}, {s['ci95'][1]:.3f}]"

    for b in range(cfg["n_batches"]):
        lines.append(
            f"| B{b + 1} | {cell(lab['best_true_per_batch'][b])} | {cell(rnd['best_true_per_batch'][b])} "
            f"| {cell(lab['simple_regret_per_batch'][b])} | {cell(rnd['simple_regret_per_batch'][b])} |"
        )
    lines.append("")
    for m, d in (("LabMind", lab), ("Random", rnd)):
        t = d["batches_to_threshold"]
        mean_t = f"{t['mean_if_reached']:.2f}" if t["mean_if_reached"] is not None else "n/a"
        lines.append(
            f"{m}: reached {cfg['threshold']:.0%} of optimum in {t['reached_fraction']:.0%} of seeds "
            f"(mean batches when reached: {mean_t})"
        )
    p = result["paired_final_regret_random_minus_labmind"]
    lines.append(
        f"Paired final regret (random - LabMind): {p['mean']:.3f} [{p['ci95'][0]:.3f}, {p['ci95'][1]:.3f}], "
        f"LabMind better in {p['labmind_better_fraction']:.0%} of seeds, Wilcoxon p={p['wilcoxon_p']}"
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seeds", type=int, default=30)
    parser.add_argument("--batches", type=int, default=5)
    parser.add_argument("--noise", type=float, default=NOISE_SD)
    parser.add_argument("--threshold", type=float, default=0.9)
    parser.add_argument("--out", type=Path, default=None, help="write full JSON results here")
    args = parser.parse_args()

    t0 = time.perf_counter()
    result = evaluate(args.seeds, args.batches, args.noise, args.threshold)
    result["config"]["harness_wall_seconds"] = time.perf_counter() - t0
    print(format_table(result))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2))
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
