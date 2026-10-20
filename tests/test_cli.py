import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from slmstudio import cli

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "examples" / "sample_sft.jsonl"


def run_cli(argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = cli.main(argv)
    lines = [l for l in buf.getvalue().splitlines() if l.strip()]
    # Exactly one JSON object on stdout is part of the contract.
    assert len(lines) == 1, f"expected one JSON line, got {len(lines)}"
    return code, json.loads(lines[0])


class PrepareTests(unittest.TestCase):
    def test_prepare_writes_outputs_and_reports(self):
        with tempfile.TemporaryDirectory() as d:
            code, payload = run_cli(["prepare", "--files", str(SAMPLE), "--out", d, "--eval-fraction", "0.2"])
            self.assertEqual(code, 0)
            self.assertTrue(payload["ok"])
            self.assertTrue((Path(d) / "train.jsonl").exists())
            self.assertTrue((Path(d) / "report.json").exists())
            self.assertEqual(payload["report"]["rows_invalid"], 2)

    def test_missing_file_is_reported_as_json_error(self):
        with tempfile.TemporaryDirectory() as d:
            code, payload = run_cli(["prepare", "--files", str(Path(d) / "nope.jsonl"), "--out", d])
            self.assertEqual(code, 1)
            self.assertFalse(payload["ok"])
            self.assertIn("not found", payload["error"])

    def test_unsupported_type_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "doc.pdf"
            p.write_bytes(b"%PDF-1.4")
            code, payload = run_cli(["prepare", "--files", str(p), "--out", d])
            self.assertEqual(code, 1)
            self.assertIn("unsupported", payload["error"])

    def test_empty_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "empty.jsonl"
            p.write_text("", encoding="utf-8")
            code, payload = run_cli(["prepare", "--files", str(p), "--out", d])
            self.assertEqual(code, 1)
            self.assertIn("empty", payload["error"])

    def test_eval_fraction_bounds_enforced(self):
        with tempfile.TemporaryDirectory() as d:
            code, payload = run_cli(["prepare", "--files", str(SAMPLE), "--out", d, "--eval-fraction", "0.9"])
            self.assertEqual(code, 1)
            self.assertIn("eval fraction", payload["error"])

    def test_unicode_content_survives(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "hi.jsonl"
            p.write_text(json.dumps({"question": "नमस्ते, VPN कैसे reset करें?",
                                     "answer": "पोर्टल खोलें और Security चुनें।"}, ensure_ascii=False) + "\n",
                         encoding="utf-8")
            out = Path(d) / "out"
            code, payload = run_cli(["prepare", "--files", str(p), "--out", str(out), "--eval-fraction", "0.5"])
            self.assertEqual(code, 0)
            combined = (out / "train.jsonl").read_text(encoding="utf-8") + (out / "eval.jsonl").read_text(encoding="utf-8")
            self.assertIn("नमस्ते", combined)


class HardwareTests(unittest.TestCase):
    def test_hardware_payload_shape(self):
        code, payload = run_cli(["hardware"])
        self.assertEqual(code, 0)
        self.assertIn("hardware", payload)
        self.assertIn("recommendation", payload)
        self.assertIn(payload["recommendation"]["status"], {"ok", "unknown", "too_small"})


class VersionTests(unittest.TestCase):
    def test_version(self):
        code, payload = run_cli(["version"])
        self.assertEqual(code, 0)
        self.assertTrue(payload["version"])


if __name__ == "__main__":
    unittest.main()
