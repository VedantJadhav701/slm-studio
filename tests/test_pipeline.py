import json
import tempfile
import unittest
from pathlib import Path

from slmstudio.dedupe import dedupe
from slmstudio.hardware import HardwareProfile
from slmstudio.ingest import IngestError, UnsupportedFormatError, load_file
from slmstudio.pipeline import main, run
from slmstudio.recommend import recommend, usable_memory_gb
from slmstudio.split import split_records
from slmstudio.validate import validate_records

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "examples" / "sample_sft.jsonl"


def write(tmp: Path, name: str, content: str) -> Path:
    p = tmp / name
    p.write_text(content, encoding="utf-8")
    return p


class IngestTests(unittest.TestCase):
    def test_jsonl_reports_line_numbers(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(Path(d), "a.jsonl", '{"a": 1}\n\n{"b": 2}\n')
            rows = load_file(p)
            self.assertEqual([r["_line"] for r in rows], [1, 3])

    def test_bad_jsonl_line_is_located(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(Path(d), "bad.jsonl", '{"a": 1}\n{oops\n')
            with self.assertRaises(IngestError) as ctx:
                load_file(p)
            self.assertEqual(ctx.exception.line, 2)

    def test_csv_rows_become_records(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(Path(d), "t.csv", "question,answer\nWhat?,This.\n")
            rows = load_file(p)
            self.assertEqual(rows[0]["question"], "What?")
            self.assertEqual(rows[0]["_line"], 2)

    def test_json_wrapper_is_unwrapped(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(Path(d), "w.json", json.dumps({"data": [{"question": "q", "answer": "a"}]}))
            self.assertEqual(len(load_file(p)), 1)

    def test_unsupported_format_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = write(Path(d), "x.pdf", "%PDF")
            with self.assertRaises(UnsupportedFormatError):
                load_file(p)


class ValidateTests(unittest.TestCase):
    def _v(self, rec):
        return validate_records([{**rec, "_source": "t", "_line": 1}])

    def test_chat_shape_accepted(self):
        r = self._v({"messages": [{"role": "user", "content": "hello there"},
                                  {"role": "assistant", "content": "hi, how can I help"}]})
        self.assertEqual(len(r.records), 1)
        self.assertEqual(r.records[0]["_kind"], "sft")

    def test_chat_without_assistant_rejected(self):
        r = self._v({"messages": [{"role": "user", "content": "hello there"}]})
        self.assertEqual(len(r.issues), 1)
        self.assertIn("assistant", r.issues[0].message)

    def test_instruction_with_input_is_merged(self):
        r = self._v({"instruction": "Summarise", "input": "Long text here", "output": "Short."})
        self.assertIn("Long text here", r.records[0]["messages"][0]["content"])

    def test_empty_instruction_rejected(self):
        r = self._v({"instruction": "", "output": "something"})
        self.assertEqual(len(r.issues), 1)

    def test_unknown_shape_rejected_with_guidance(self):
        r = self._v({"foo": "bar"})
        self.assertIn("unrecognised", r.issues[0].message)

    def test_text_is_cpt(self):
        r = self._v({"text": "A long enough paragraph of domain text to be kept."})
        self.assertEqual(r.records[0]["_kind"], "cpt")


class DedupeTests(unittest.TestCase):
    def _rec(self, q, a, line):
        return {"messages": [{"role": "user", "content": q}, {"role": "assistant", "content": a}],
                "_kind": "sft", "_source": "f", "_line": line}

    def test_exact_duplicate_removed(self):
        kept, dups = dedupe([self._rec("q one", "a one", 1), self._rec("q one", "a one", 2)])
        self.assertEqual(len(kept), 1)
        self.assertEqual(dups[0]["_dup_kind"], "exact")

    def test_near_duplicate_removed(self):
        kept, dups = dedupe([self._rec("Reset VPN?", "Use the portal.", 1),
                             self._rec("reset vpn", "use the portal", 2)])
        self.assertEqual(len(kept), 1)
        self.assertEqual(dups[0]["_dup_kind"], "near")

    def test_distinct_records_kept(self):
        kept, dups = dedupe([self._rec("q one", "a one", 1), self._rec("q two", "a two", 2)])
        self.assertEqual(len(kept), 2)
        self.assertEqual(dups, [])


class SplitTests(unittest.TestCase):
    def _recs(self, n):
        return [{"messages": [{"role": "user", "content": f"q{i}"},
                              {"role": "assistant", "content": f"a{i}"}]} for i in range(n)]

    def test_split_is_deterministic(self):
        a1, b1 = split_records(self._recs(200))
        a2, b2 = split_records(self._recs(200))
        self.assertEqual(len(b1), len(b2))
        self.assertEqual([r["messages"] for r in b1], [r["messages"] for r in b2])

    def test_no_overlap_between_train_and_eval(self):
        train, evals = split_records(self._recs(300))
        train_keys = {json.dumps(r["messages"]) for r in train}
        eval_keys = {json.dumps(r["messages"]) for r in evals}
        self.assertTrue(train_keys.isdisjoint(eval_keys))
        self.assertEqual(len(train) + len(evals), 300)

    def test_small_dataset_still_gets_eval(self):
        train, evals = split_records(self._recs(5), eval_fraction=0.01)
        self.assertGreaterEqual(len(evals), 1)

    def test_invalid_fraction_rejected(self):
        with self.assertRaises(ValueError):
            split_records(self._recs(10), eval_fraction=1.5)


class RecommendTests(unittest.TestCase):
    def _hw(self, **kw):
        base = dict(os="x", cpu_model=None, cpu_cores=4, ram_gb=None,
                    gpu_name=None, gpu_vram_gb=None, gpu_vendor=None)
        base.update(kw)
        return HardwareProfile(**base)

    def test_unknown_hardware_is_conservative(self):
        rec = recommend(self._hw())
        self.assertEqual(rec["status"], "unknown")
        self.assertFalse(rec["can_lora_train"])

    def test_small_machine_gets_small_model_no_training(self):
        rec = recommend(self._hw(ram_gb=8))
        self.assertIn(rec["recommended"], {"qwen3-0.6b", "qwen3-1.7b", "qwen3-4b"})
        self.assertFalse(rec["can_full_finetune"])

    def test_gpu_vram_preferred_over_ram(self):
        self.assertAlmostEqual(usable_memory_gb(self._hw(ram_gb=64, gpu_vram_gb=8, gpu_vendor="nvidia")), 6.8)

    def test_too_small_machine(self):
        rec = recommend(self._hw(ram_gb=1))
        self.assertEqual(rec["status"], "too_small")


class PipelineTests(unittest.TestCase):
    def test_sample_end_to_end(self):
        result = run([str(SAMPLE)], eval_fraction=0.2)
        r = result["report"]
        self.assertGreater(r["rows_valid"], 0)
        self.assertGreater(r["rows_invalid"], 0)          # the deliberately bad rows
        self.assertEqual(r["duplicates_exact"], 1)         # the repeated VPN row
        self.assertEqual(r["kinds"].get("cpt"), 1)
        sft_valid = r["rows_valid"] - r["kinds"]["cpt"]
        self.assertEqual(r["train_size"] + r["eval_size"], sft_valid - r["duplicates_removed"])

    def test_cli_writes_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            code = main([str(SAMPLE), "--out", d, "--eval-fraction", "0.2"])
            self.assertEqual(code, 0)
            self.assertTrue((Path(d) / "train.jsonl").exists())
            self.assertTrue((Path(d) / "eval.jsonl").exists())
            self.assertTrue((Path(d) / "cpt.jsonl").exists())
            report = json.loads((Path(d) / "report.json").read_text(encoding="utf-8"))
            self.assertIn("warnings", report)


if __name__ == "__main__":
    unittest.main()
