"""Audit log recorder for all agent interactions, tool calls, and user approvals."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


class AuditLogger:
    """Writes tamper-evident audit entries to audit.jsonl in the project directory."""

    def __init__(self, log_path: str | Path):
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        event_type: str,  # "prompt", "retrieval", "tool_proposal", "approval", "execution"
        details: Dict[str, Any],
        user_approved: Optional[bool] = None,
    ) -> None:
        entry = {
            "timestamp": time.time(),
            "iso_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "event": event_type,
            "user_approved": user_approved,
            "details": details,
        }
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
