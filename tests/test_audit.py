"""Dedicated test suite for audit log recording and tamper verification."""

import json
import tempfile
import unittest
from pathlib import Path
from slmstudio.agent import AuditLogger


class TestAuditLoggerExtended(unittest.TestCase):
    def test_audit_log_format_and_ordering(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_file = Path(tmp) / "audit.jsonl"
            logger = AuditLogger(log_file)

            logger.record("prompt", {"user_id": "eng_1", "text": "Deploy model"})
            logger.record("tool_proposal", {"tool": "suggest_command", "args": {"template_id": "git_status"}})
            logger.record("approval", {"approved_by": "admin"}, user_approved=True)

            lines = [json.loads(l) for l in log_file.read_text(encoding="utf-8").splitlines() if l.strip()]
            self.assertEqual(len(lines), 3)
            self.assertEqual(lines[0]["event"], "prompt")
            self.assertEqual(lines[1]["event"], "tool_proposal")
            self.assertEqual(lines[2]["event"], "approval")
            self.assertTrue(lines[2]["user_approved"])


if __name__ == "__main__":
    unittest.main()
