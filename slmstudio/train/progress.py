"""Structured JSON-lines progress logger for training sidecar."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


class ProgressLogger:
    """Appends structured progress events to progress.jsonl for Electron supervision."""

    def __init__(self, log_path: str | Path):
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.start_time = time.time()

    def log_event(self, event_type: str, data: Optional[Dict[str, Any]] = None) -> None:
        payload = {
            "timestamp": round(time.time(), 3),
            "elapsed_seconds": round(time.time() - self.start_time, 2),
            "event": event_type,
            **(data or {}),
        }
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def log_step(
        self,
        step: int,
        total_steps: int,
        epoch: float,
        loss: float,
        learning_rate: float,
        eta_seconds: Optional[float] = None,
        memory_mb: Optional[float] = None,
    ) -> None:
        percent = round((step / max(1, total_steps)) * 100, 1)
        self.log_event(
            "step",
            {
                "step": step,
                "total_steps": total_steps,
                "percent": percent,
                "epoch": round(epoch, 3),
                "loss": round(loss, 4),
                "learning_rate": learning_rate,
                "eta_seconds": round(eta_seconds, 1) if eta_seconds is not None else None,
                "memory_mb": round(memory_mb, 1) if memory_mb is not None else None,
            },
        )

    def log_completed(self, summary: Dict[str, Any]) -> None:
        self.log_event("completed", {"summary": summary})

    def log_cancelled(self, reason: str = "User requested cancellation") -> None:
        self.log_event("cancelled", {"reason": reason})

    def log_error(self, error_message: str) -> None:
        self.log_event("error", {"error": error_message})
