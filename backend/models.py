from collections import Counter
from pydantic import BaseModel
from typing import Optional


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    state_changed: bool
    new_state: str


class ImageUrls(BaseModel):
    optimal: str
    baseline: str


class ProposalSummary(BaseModel):
    experiment_count: int
    param_ranges: dict
    image_urls: ImageUrls


class StatusResponse(BaseModel):
    current_state: str
    current_batch_id: Optional[str]
    pending_proposal_id: Optional[str]
    chat_history: list[dict]
    latest_analysis: Optional[str]
    latest_constraints: Optional[str]
    image_urls: Optional[ImageUrls]
    proposal_summary: Optional[ProposalSummary]


class ExperimentParameters(BaseModel):
    pH: float
    temperature_c: int
    concentration_mg_ml: float
    lipid_ratio: str
    incubation_hours: int


class Experiment(BaseModel):
    exp_id: str
    parameters: ExperimentParameters
    transfection_rate: Optional[float]
    cell_viability: Optional[float]
    is_top_performer: Optional[bool]


class BatchResponse(BaseModel):
    batch_id: str
    description: str
    status: str
    created_at: str
    experiments: list[Experiment]


class BatchSummary(BaseModel):
    batch_id: str
    description: str
    status: str
    experiment_count: int
    best_transfection_rate: Optional[float]
    mean_transfection_rate: Optional[float]


class SimulateResponse(BaseModel):
    status: str


class ApproveResponse(BaseModel):
    status: str


class RegenerateResponse(BaseModel):
    status: str


def _compute_proposal_summary(experiments: list[dict], image_urls: dict) -> dict:
    param_values = {k: [] for k in ["pH", "temperature_c", "concentration_mg_ml", "incubation_hours"]}
    lipid_ratios = []
    for exp in experiments:
        p = exp["parameters"]
        for k in param_values:
            param_values[k].append(p[k])
        lipid_ratios.append(p["lipid_ratio"])

    param_ranges = {
        k: {"min": round(min(v), 3), "max": round(max(v), 3)}
        for k, v in param_values.items()
    }
    param_ranges["lipid_ratio"] = Counter(lipid_ratios).most_common(1)[0][0]

    return {
        "experiment_count": len(experiments),
        "param_ranges": param_ranges,
        "image_urls": image_urls,
    }
