"""Unit tests for SLM Studio multi-model comparative evaluation."""

import json
import tempfile
import unittest
from pathlib import Path

from slmstudio.eval import run_comparative_eval


class TestComparativeEvaluation(unittest.TestCase):
    def test_comparative_eval_generates_side_by_side_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            eval_file = tmp_path / "eval.jsonl"
            records = [
                {
                    "messages": [
                        {"role": "user", "content": "How do I reset my company password?"},
                        {"role": "assistant", "content": "Visit the IT self-service portal."},
                    ]
                },
                {
                    "messages": [
                        {"role": "user", "content": "What is the VPN server address?"},
                        {"role": "assistant", "content": "The VPN address is vpn.company.internal."},
                    ]
                },
            ]
            eval_file.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")

            res = run_comparative_eval(
                eval_jsonl_path=eval_file,
                output_dir=tmp_path,
                base_model="llama3.2:1b",
                finetuned_model="custom-finetuned",
                ollama_client=None,
            )

            self.assertTrue(res["ok"])
            summary = res["summary"]
            self.assertEqual(summary["records_tested"], 2)
            self.assertIn("base_f1", summary["scores"])
            self.assertIn("finetuned_f1", summary["scores"])
            self.assertIn("delta_f1", summary["scores"])

            out_report = tmp_path / "comparison_report.json"
            self.assertTrue(out_report.exists())


if __name__ == "__main__":
    unittest.main()
