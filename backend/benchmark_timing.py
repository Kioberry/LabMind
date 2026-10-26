"""
Wall-clock benchmark of one LabMind decision cycle, step by step.

Measured always (no API key needed):
  image_processing  : real TIF pipeline (process_experiment) for one 20-well batch
  propose_candidates: the LHS proposal step (no LLM)
Measured only with --with-agent AND ANTHROPIC_API_KEY set (costs API calls):
  agent_decision    : LabMindAgent.run_analysis_loop, i.e. Claude's tool-calling loop
                      (load results -> top performer -> proposal -> images -> analysis text)

The app's 0.4 s/experiment sleep in main.process_batch_with_log is cosmetic and is NOT
included. The agent run uses a temporary copy of data/ so real state is never touched.

Usage (from backend/):
  python benchmark_timing.py --reps 3 [--with-agent] --out ../docs/eval/timing.json
"""
import argparse
import json
import os
import platform
import shutil
import statistics
import tempfile
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).parent


def _stats(xs: list[float]) -> dict:
    return {
        "mean": statistics.mean(xs),
        "std": statistics.stdev(xs) if len(xs) > 1 else 0.0,
        "min": min(xs),
        "max": max(xs),
        "n": len(xs),
        "samples": xs,
    }


def time_image_processing(n_wells: int = 20, reps: int = 3) -> dict:
    from image_processing import process_experiment
    out = []
    for r in range(reps):
        t0 = time.perf_counter()
        for i in range(n_wells):
            process_experiment(i + 1, f"BENCH-{r}-{i + 1:02d}", "BENCH")
        out.append(time.perf_counter() - t0)
    return _stats(out)


def time_propose_candidates(reps: int = 50) -> dict:
    from tools import propose_candidates
    batch = json.loads((BACKEND_DIR / "data" / "batches" / "batch_B1.json").read_text())
    top = max(batch["experiments"], key=lambda e: e["transfection_rate"] or 0.0)
    out = []
    for r in range(reps):
        t0 = time.perf_counter()
        propose_candidates(top, "B2", seed=r)
        out.append(time.perf_counter() - t0)
    return _stats(out)


def time_agent_decision(reps: int = 1) -> dict:
    """Runs the real Claude agent against a throwaway copy of data/. Requires ANTHROPIC_API_KEY."""
    tmp = Path(tempfile.mkdtemp(prefix="labmind_bench_"))
    shutil.copytree(BACKEND_DIR / "data" / "batches", tmp / "batches")
    os.environ["DATA_DIR"] = str(tmp)  # must be set before tools/agent are imported
    from agent import LabMindAgent
    out, errors = [], []
    for _ in range(reps):
        agent = LabMindAgent()
        t0 = time.perf_counter()
        try:
            agent.run_analysis_loop("B1")
            out.append(time.perf_counter() - t0)
        except Exception as exc:  # report, don't hide
            errors.append(f"{type(exc).__name__}: {exc}"[:300])
    shutil.rmtree(tmp, ignore_errors=True)
    return {**(_stats(out) if out else {"n": 0}), "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reps", type=int, default=3)
    parser.add_argument("--with-agent", action="store_true")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    os.chdir(BACKEND_DIR)
    from dotenv import load_dotenv
    load_dotenv()

    result = {
        "machine": {"python": platform.python_version(), "platform": platform.platform(),
                    "processor": platform.processor()},
        "image_processing_20_wells_seconds": time_image_processing(reps=args.reps),
        "propose_candidates_seconds": time_propose_candidates(),
    }
    if args.with_agent:
        if os.environ.get("ANTHROPIC_API_KEY", "").startswith("sk-"):
            result["agent_decision_seconds"] = time_agent_decision(reps=args.reps)
        else:
            result["agent_decision_seconds"] = {"skipped": "ANTHROPIC_API_KEY not set"}
    else:
        result["agent_decision_seconds"] = {"skipped": "run with --with-agent to measure (uses API calls)"}

    print(json.dumps({k: ({kk: vv for kk, vv in v.items() if kk != "samples"} if isinstance(v, dict) else v)
                      for k, v in result.items()}, indent=2))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2))
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
