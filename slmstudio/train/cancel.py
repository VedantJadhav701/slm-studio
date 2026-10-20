"""Job cancellation and crash recovery coordinator for training jobs."""

from __future__ import annotations

import os
import signal
from pathlib import Path
from typing import Any, Dict


class CancellationHandler:
    """Watches for cancellation flags and ensures atomic cleanup."""

    def __init__(self, job_dir: str | Path):
        self.job_dir = Path(job_dir)
        self.cancel_file = self.job_dir / "cancel.signal"
        self._cancelled = False

    def request_cancellation(self) -> None:
        self.job_dir.mkdir(parents=True, exist_ok=True)
        self.cancel_file.write_text("CANCEL", encoding="utf-8")
        self._cancelled = True

    def is_cancelled(self) -> bool:
        if self._cancelled:
            return True
        if self.cancel_file.exists():
            self._cancelled = True
            return True
        return False

    def clean_signal(self) -> None:
        if self.cancel_file.exists():
            try:
                self.cancel_file.unlink()
            except OSError:
                pass


def recover_incomplete_job(job_dir: str | Path) -> Dict[str, Any]:
    """Examines a job directory and recovers state if a crash or abrupt stop occurred."""
    p = Path(job_dir)
    progress_file = p / "progress.jsonl"
    adapter_dir = p / "adapter"

    status = "not_started"
    last_step = 0

    if progress_file.exists():
        lines = [l.strip() for l in progress_file.read_text(encoding="utf-8").splitlines() if l.strip()]
        if lines:
            import json
            try:
                last_event = json.loads(lines[-1])
                evt = last_event.get("event")
                if evt == "completed":
                    status = "completed"
                elif evt == "cancelled":
                    status = "cancelled"
                elif evt == "error":
                    status = "error"
                else:
                    status = "interrupted"
                    last_step = last_event.get("step", 0)
            except Exception:
                status = "unknown"

    return {
        "job_dir": str(p.resolve()),
        "status": status,
        "last_step": last_step,
        "adapter_exists": adapter_dir.exists(),
    }
