import json
import threading
from pathlib import Path

STATE_ENUM = {
    "IDLE", "RUNNING", "COMPLETE", "ANALYZING",
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
