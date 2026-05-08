import os
import re
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import anthropic

from state_manager import StateManager
from agent import LabMindAgent
from image_processing import process_experiment
from models import (
    ChatRequest, ChatResponse,
    StatusResponse, BatchResponse, BatchSummary,
    SimulateResponse, ApproveResponse, RegenerateResponse,
    ImageUrls, ProposalSummary, _compute_proposal_summary,
)

app = FastAPI(title="LabMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

DATA_DIR = os.environ.get("DATA_DIR", "data")
state_manager = StateManager(data_dir=DATA_DIR)
agent = LabMindAgent()


def _next_batch_id(batch_id: str) -> str:
    n = int(batch_id[1:])
    return f"B{n + 1}"


def is_constraint_message(message: str) -> bool:
    keywords = [
        "exclude", "avoid", "cap", "limit", "no more than", "at most",
        "at least", "below", "above", "don't", "must not", "restrict",
        "maximum", "minimum", "max", "min",
    ]
    lower = message.lower()
    return any(kw in lower for kw in keywords)


def _rewrite_analysis_with_constraints(
    existing_analysis: str, constraints: str, top_performer: dict
) -> str:
    client = anthropic.Anthropic()
    prompt = (
        f"Rewrite the following scientific analysis to incorporate the researcher's constraint. "
        f"Keep the same 3–4 sentence structure and scientific tone. "
        f"Add a sentence explaining why the constraint makes scientific sense given the top performer data.\n\n"
        f"Original analysis:\n{existing_analysis}\n\n"
        f"Researcher constraint: {constraints}\n\n"
        f"Top performer parameters: {json.dumps(top_performer['parameters'])}\n\n"
        f"Return only the rewritten analysis text — no JSON, no markdown."
    )
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


@app.on_event("startup")
async def startup_event() -> None:
    from image_processing import PROCESSED_DIR
    for f in PROCESSED_DIR.glob("*.png"):
        f.unlink(missing_ok=True)
    state_manager.reset_to_idle()


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


_RESET_BLOCKED_STATES = {"RUNNING", "COMPLETE", "PROCESSING", "ANALYZING", "REGENERATING", "APPROVED"}

@app.post("/api/reset")
async def reset_endpoint() -> dict:
    s = state_manager.get_state()
    if s["current_state"] in _RESET_BLOCKED_STATES:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot reset while background task is running (state: {s['current_state']}). "
                   "Wait for PROPOSAL_READY or EDITING state."
        )
    from image_processing import PROCESSED_DIR
    for f in PROCESSED_DIR.glob("*.png"):
        f.unlink(missing_ok=True)
    state_manager.reset_to_idle()
    return {"status": "reset"}


@app.post("/api/simulate", response_model=SimulateResponse)
async def simulate_endpoint(background_tasks: BackgroundTasks) -> SimulateResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("IDLE", "RUNNING"):
        raise HTTPException(status_code=409, detail=f"Cannot simulate: current state is {s['current_state']}")
    state_manager.set_state("RUNNING")
    if s["current_batch_id"] is None:
        state_manager.update_state({"current_batch_id": "B1"})
    current_state = state_manager.get_state()
    background_tasks.add_task(run_agent_loop, current_state["current_batch_id"])
    return SimulateResponse(status="started")


@app.get("/api/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    s = state_manager.get_state()
    image_urls = ImageUrls(**s["image_urls"]) if s.get("image_urls") else None
    proposal_summary = None
    if s["current_state"] in ("PROPOSAL_READY", "EDITING", "REGENERATING"):
        try:
            proposal = state_manager.read_proposal()
            proposal_summary_dict = _compute_proposal_summary(proposal["experiments"], s["image_urls"])
            proposal_summary = ProposalSummary(**proposal_summary_dict)
        except FileNotFoundError:
            pass
    return StatusResponse(
        current_state=s["current_state"],
        current_batch_id=s.get("current_batch_id"),
        pending_proposal_id=s.get("pending_proposal_id"),
        chat_history=s.get("chat_history", []),
        latest_analysis=s.get("latest_analysis"),
        latest_constraints=s.get("latest_constraints"),
        image_urls=image_urls,
        proposal_summary=proposal_summary,
        processing_log=s.get("processing_log", []),
        processing_log_step=s.get("processing_log_step"),
    )


@app.get("/api/batch/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str) -> BatchResponse:
    if not re.fullmatch(r'B\d+', batch_id):
        raise HTTPException(status_code=400, detail=f"Invalid batch ID: {batch_id}")
    try:
        data = state_manager.read_batch(batch_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return BatchResponse(**data)


@app.get("/api/batches", response_model=list[BatchSummary])
async def get_all_batches() -> list[BatchSummary]:
    ids = state_manager.list_batch_ids()
    summaries = []
    for bid in ids:
        data = state_manager.read_batch(bid)
        rates = [e["transfection_rate"] for e in data["experiments"] if e.get("transfection_rate") is not None]
        summaries.append(BatchSummary(
            batch_id=data["batch_id"],
            description=data["description"],
            status=data["status"],
            experiment_count=len(data["experiments"]),
            best_transfection_rate=round(max(rates), 2) if rates else None,
            mean_transfection_rate=round(sum(rates) / len(rates), 2) if rates else None,
        ))
    return summaries


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(body: ChatRequest, background_tasks: BackgroundTasks) -> ChatResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("PROPOSAL_READY", "EDITING"):
        raise HTTPException(status_code=409, detail="Chat is only available during PROPOSAL_READY or EDITING states")
    state_manager.append_chat_message("user", body.message)
    reply = await asyncio.to_thread(agent.chat, body.message)
    state_manager.append_chat_message("agent", reply)
    state_changed = is_constraint_message(body.message)
    if state_changed:
        state_manager.update_state({"latest_constraints": body.message})
        state_manager.set_state("EDITING")
    new_state = state_manager.get_state()["current_state"]
    return ChatResponse(response=reply, state_changed=state_changed, new_state=new_state)


@app.post("/api/approve", response_model=ApproveResponse)
async def approve_endpoint(background_tasks: BackgroundTasks) -> ApproveResponse:
    s = state_manager.get_state()
    if s["current_state"] != "PROPOSAL_READY":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot approve: current state is {s['current_state']}. Regenerate or continue to PROPOSAL_READY first."
        )
    state_manager.set_state("APPROVED")
    background_tasks.add_task(finalize_approval)
    return ApproveResponse(status="approved")


@app.post("/api/regenerate", response_model=RegenerateResponse)
async def regenerate_endpoint(background_tasks: BackgroundTasks) -> RegenerateResponse:
    s = state_manager.get_state()
    if s["current_state"] not in ("EDITING", "PROPOSAL_READY"):
        raise HTTPException(
            status_code=409,
            detail="Cannot regenerate: no constraints set. Send a constraint message first."
        )
    if not s.get("latest_constraints"):
        raise HTTPException(
            status_code=409,
            detail="Cannot regenerate: no constraints set. Send a constraint message in chat first."
        )
    state_manager.set_state("REGENERATING")
    background_tasks.add_task(run_regeneration)
    return RegenerateResponse(status="started")


def process_batch_with_log(batch_id: str, exp_ids: list[str]) -> list[dict]:
    results = []
    n_total = len(exp_ids)
    for i, exp_id in enumerate(exp_ids):
        well_index = i + 1
        result = process_experiment(well_index, exp_id)
        results.append({"exp_id": exp_id, **result})
        state_manager.update_experiment_result(batch_id, exp_id, result["transfection_rate"])
        rate_pct = round(result["transfection_rate"] * 100, 1)
        total_nuclei = result.get("total_nuclei", 0)
        gfp_positive = result.get("gfp_positive", 0)
        state_manager.append_processing_log(
            f"[{i + 1}/{n_total}]  {exp_id} — {total_nuclei} nuclei detected, "
            f"{gfp_positive} GFP+ cells → {rate_pct}% efficiency"
        )
        time.sleep(0.4)
    state_manager.finalize_batch_top_performer(batch_id)
    if not results:
        return results
    top = max(results, key=lambda r: r["transfection_rate"])
    state_manager.append_processing_log(
        f"✓  Image processing complete — top performer: {top['exp_id']} "
        f"at {round(top['transfection_rate'] * 100, 1)}%"
    )
    return results


async def run_agent_loop(batch_id: str) -> None:
    state_manager.reset_processing_log()
    await asyncio.sleep(2)
    state_manager.set_state("COMPLETE")
    state_manager.set_state("PROCESSING")

    batch_data = state_manager.read_batch(batch_id)
    exp_ids = [e["exp_id"] for e in batch_data["experiments"]]
    try:
        await asyncio.to_thread(process_batch_with_log, batch_id, exp_ids)
    except Exception as exc:
        logging.error("Image processing failed: %s", exc)
        state_manager.set_state("IDLE")
        return

    state_manager.set_state("ANALYZING")
    state_manager.append_processing_log("Running AI scientific analysis...")
    state_manager.append_processing_log(f"  Loading experiment data for batch {batch_id}...")

    try:
        result = await asyncio.to_thread(agent.run_analysis_loop, batch_id)
    except Exception as exc:
        logging.error("Agent analysis failed: %s", exc)
        state_manager.update_state({"current_state": "IDLE"})
        return

    state_manager.append_processing_log("✓  Proposal ready for researcher review.")
    next_id = _next_batch_id(batch_id)
    state_manager.update_state({
        "latest_analysis": result["analysis_text"],
        "image_urls": result["image_urls"],
        "pending_proposal_id": next_id,
    })
    state_manager.set_state("PROPOSAL_READY")


async def run_regeneration() -> None:
    from tools import load_batch_results_impl, find_top_performer_impl, generate_next_batch_impl
    s = state_manager.get_state()
    batch_id = s["current_batch_id"]
    constraints = s["latest_constraints"]
    pending_id = s["pending_proposal_id"]

    batch_data = await asyncio.to_thread(load_batch_results_impl, batch_id)
    top_result = find_top_performer_impl(batch_data["experiments"])
    top_performer = top_result["top_experiment"]
    experiments = await asyncio.to_thread(generate_next_batch_impl, top_performer, constraints, pending_id)

    proposal = {
        "proposal_id": pending_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_batch_id": batch_id,
        "top_performer_id": top_performer["exp_id"],
        "constraints_applied": constraints,
        "experiments": experiments,
    }
    state_manager.write_proposal(proposal)

    new_analysis = await asyncio.to_thread(
        _rewrite_analysis_with_constraints, s["latest_analysis"], constraints, top_performer
    )
    state_manager.update_state({"latest_analysis": new_analysis})
    state_manager.set_state("PROPOSAL_READY")


async def finalize_approval() -> None:
    proposal = state_manager.read_proposal()
    next_id = proposal["proposal_id"]
    new_batch = {
        "batch_id": next_id,
        "description": f"Proposed batch generated from {proposal['source_batch_id']} top performer",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "experiments": [
            {**exp, "transfection_rate": None, "is_top_performer": False}
            for exp in proposal["experiments"]
        ],
    }
    state_manager.write_batch(next_id, new_batch)
    state_manager.update_state({
        "current_batch_id": next_id,
        "pending_proposal_id": None,
        "latest_constraints": None,
        "latest_analysis": None,
        "image_urls": None,
    })
    state_manager.reset_chat()
    state_manager.set_state("RUNNING")


# Static files mount — must come after all route registrations
app.mount("/static", StaticFiles(directory="static"), name="static")
