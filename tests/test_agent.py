"""Unit tests for SLM Studio suggest-only agent, tool schemas, and audit logging."""

import json
import tempfile
import unittest
from pathlib import Path

from slmstudio.agent import (
    AuditLogger,
    get_all_tool_schemas,
    parse_and_validate_tool_call,
)


class TestAgentModule(unittest.TestCase):
    def test_tool_schemas(self):
        schemas = get_all_tool_schemas()
        self.assertGreaterEqual(len(schemas), 3)
        names = [s["function"]["name"] for s in schemas]
        self.assertIn("create_ticket", names)
        self.assertIn("search_knowledge", names)
        self.assertIn("suggest_command", names)

    def test_grammar_validation_valid(self):
        raw = json.dumps({
            "name": "create_ticket",
            "parameters": {
                "category": "it",
                "priority": "high",
                "summary": "Cannot connect to company WiFi",
                "description": "Signal drops intermittently in room 4B",
            },
        })
        valid, parsed, msg = parse_and_validate_tool_call(raw)
        self.assertTrue(valid)
        self.assertEqual(parsed["tool"], "create_ticket")
        self.assertTrue(parsed["requires_approval"])

    def test_grammar_validation_disallowed_tool(self):
        raw = json.dumps({"name": "delete_all_files", "parameters": {}})
        valid, parsed, msg = parse_and_validate_tool_call(raw)
        self.assertFalse(valid)
        self.assertIn("disallowed", msg)

    def test_grammar_validation_invalid_enum(self):
        raw = json.dumps({
            "name": "create_ticket",
            "parameters": {
                "category": "invalid_cat",
                "priority": "high",
                "summary": "Test",
                "description": "Desc",
            },
        })
        valid, parsed, msg = parse_and_validate_tool_call(raw)
        self.assertFalse(valid)
        self.assertIn("enum", msg)

    def test_audit_logger(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "audit.jsonl"
            logger = AuditLogger(log_path)
            logger.record("prompt", {"query": "test query"})
            logger.record("tool_proposal", {"tool": "create_ticket"}, user_approved=True)

            lines = log_path.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 2)
            e1 = json.loads(lines[0])
            self.assertEqual(e1["event"], "prompt")
            e2 = json.loads(lines[1])
            self.assertTrue(e2["user_approved"])


if __name__ == "__main__":
    unittest.main()
