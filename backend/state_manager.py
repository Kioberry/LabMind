import json
import threading
from pathlib import Path

STATE_ENUM = {
    "IDLE", "RUNNING", "COMPLETE", "PROCESSING", "ANALYZING",
    "PROPOSAL_READY", "EDITING", "REGENERATING", "APPROVED"
}

IDLE_DEFAULTS = {
    "current_state": "IDLE",
    "current_batch_id": None,
    "pending_proposal_id": None,
    "chat_history": [],
    "latest_analysis": None,
    "latest_constraints": None,
    "image_urls": None,
    "processing_log": [],
    "processing_log_step": None,
}


class StateManager:
    def __init__(self, data_dir: str) -> None:
        self.data_dir = Path(data_dir)
        self._lock = threading.Lock()
        (self.data_dir / "batches").mkdir(parents=True, exist_ok=True)
        (self.data_dir / "proposals").mkdir(parents=True, exist_ok=True)
        state_file = self.data_dir / "state.json"
        if not state_file.exists():
            state_file.write_text(json.dumps(IDLE_DEFAULTS, indent=2))

    def get_state(self) -> dict:
        with self._lock:
            return json.loads((self.data_dir / "state.json").read_text())

    def set_state(self, new_state: str) -> None:
        if new_state not in STATE_ENUM:
            raise ValueError(f"Invalid state: {new_state}")
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state["current_state"] = new_state
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def update_state(self, updates: dict) -> None:
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state.update(updates)
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def append_chat_message(self, role: str, content: str) -> None:
        if role not in ("user", "agent"):
            raise ValueError(f"Invalid role: {role}")
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state["chat_history"].append({"role": role, "content": content})
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def reset_chat(self) -> None:
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state["chat_history"] = []
            state["latest_constraints"] = None
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def write_proposal(self, proposal: dict) -> None:
        with self._lock:
            (self.data_dir / "proposals" / "pending.json").write_text(
                json.dumps(proposal, indent=2)
            )

    def read_proposal(self) -> dict:
        path = self.data_dir / "proposals" / "pending.json"
        if not path.exists():
            raise FileNotFoundError("No pending proposal found")
        return json.loads(path.read_text())

    def read_batch(self, batch_id: str) -> dict:
        path = self.data_dir / "batches" / f"batch_{batch_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Batch {batch_id} not found")
        return json.loads(path.read_text())

    def write_batch(self, batch_id: str, batch_data: dict) -> None:
        with self._lock:
            (self.data_dir / "batches" / f"batch_{batch_id}.json").write_text(
                json.dumps(batch_data, indent=2)
            )

    def list_batch_ids(self) -> list[str]:
        batches_dir = self.data_dir / "batches"
        ids = []
        for f in batches_dir.glob("batch_B*.json"):
            batch_id = f.stem[len("batch_"):]
            ids.append(batch_id)
        return sorted(ids, key=lambda bid: int(bid[1:]))

    def append_processing_log(self, message: str) -> None:
        """Thread-safe append of one line to processing_log in state.json."""
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state.setdefault("processing_log", []).append(message)
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def reset_processing_log(self) -> None:
        """Reset processing_log to [] and processing_log_step to None."""
        with self._lock:
            state = json.loads((self.data_dir / "state.json").read_text())
            state["processing_log"] = []
            state["processing_log_step"] = None
            (self.data_dir / "state.json").write_text(json.dumps(state, indent=2))

    def update_experiment_result(self, batch_id: str, exp_id: str, transfection_rate: float) -> None:
        """Update one experiment's transfection_rate in its batch JSON. Thread-safe."""
        batch_path = self.data_dir / "batches" / f"batch_{batch_id}.json"
        with self._lock:
            batch = json.loads(batch_path.read_text())
            for exp in batch["experiments"]:
                if exp["exp_id"] == exp_id:
                    exp["transfection_rate"] = transfection_rate
                    break
            batch_path.write_text(json.dumps(batch, indent=2))

    def reset_to_idle(self) -> None:
        """Reset state to IDLE defaults, delete B3+ batch files and pending proposal.
        All file operations are inside the lock to be atomic with concurrent writes."""
        batches_dir = self.data_dir / "batches"
        with self._lock:
            for batch_file in batches_dir.glob("batch_B*.json"):
                batch_id = batch_file.stem[len("batch_"):]
                try:
                    if int(batch_id[1:]) >= 3:
                        batch_file.unlink(missing_ok=True)
                except ValueError:
                    continue
            (self.data_dir / "proposals" / "pending.json").unlink(missing_ok=True)
            (self.data_dir / "state.json").write_text(json.dumps(IDLE_DEFAULTS, indent=2))

    def finalize_batch_top_performer(self, batch_id: str) -> None:
        """Set is_top_performer=True on the highest transfection_rate experiment. Thread-safe."""
        batch_path = self.data_dir / "batches" / f"batch_{batch_id}.json"
        with self._lock:
            batch = json.loads(batch_path.read_text())
            experiments = batch["experiments"]
            # reset all
            for exp in experiments:
                exp["is_top_performer"] = False
            # find top
            top = max(experiments, key=lambda e: (e.get("transfection_rate") or 0.0))
            top["is_top_performer"] = True
            batch_path.write_text(json.dumps(batch, indent=2))
