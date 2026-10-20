"""Unit tests for SLM Studio LoRA training sidecar."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from slmstudio.train import (
    CancellationHandler,
    ProgressLogger,
    TrainingConfig,
    apply_template,
    check_training_feasibility,
    load_and_validate_datasets,
    recover_incomplete_job,
    run_training,
)


class TestTrainingSidecar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="slm-train-test-")
        self.tmp_dir = Path(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_config_validation(self):
        cfg = TrainingConfig()
        self.assertEqual(cfg.validate(), [])

        bad_cfg = TrainingConfig(learning_rate=-0.5, batch_size=0, quantization="invalid")
        errs = bad_cfg.validate()
        self.assertGreaterEqual(len(errs), 3)

    def test_hardware_feasibility_check(self):
        can_train, notes, profile = check_training_feasibility(1.0, "4bit")
        self.assertIn("device", profile)
        self.assertIn("estimated_vram_required_gb", profile)
        self.assertIsInstance(notes, list)

    def test_templates_chatml_and_llama3(self):
        messages = [
            {"role": "user", "content": "Hello!"},
            {"role": "assistant", "content": "Hi there."},
        ]
        chatml = apply_template(messages, "chatml")
        self.assertIn("<|im_start|>user\nHello!<|im_end|>", chatml)

        llama3 = apply_template(messages, "llama3")
        self.assertIn("<|start_header_id|>user<|end_header_id|>", llama3)

    def test_zero_overlap_dataset_validation(self):
        t_file = self.tmp_dir / "train.jsonl"
        e_file = self.tmp_dir / "eval.jsonl"

        # Overlapping record
        dup_rec = {"messages": [{"role": "user", "content": "unique q"}, {"role": "assistant", "content": "a"}]}
        t_rec1 = {"messages": [{"role": "user", "content": "train only"}, {"role": "assistant", "content": "t"}]}
        e_rec1 = {"messages": [{"role": "user", "content": "eval only"}, {"role": "assistant", "content": "e"}]}

        t_file.write_text(json.dumps(dup_rec) + "\n" + json.dumps(t_rec1) + "\n", encoding="utf-8")
        e_file.write_text(json.dumps(dup_rec) + "\n" + json.dumps(e_rec1) + "\n", encoding="utf-8")

        train, evals, errors = load_and_validate_datasets(t_file, e_file)
        self.assertEqual(len(train), 1)  # overlapping record removed from train
        self.assertEqual(len(evals), 2)
        self.assertTrue(any("Zero-overlap rule violated" in err for err in errors))

    def test_progress_logger(self):
        log_file = self.tmp_dir / "progress.jsonl"
        logger = ProgressLogger(log_file)
        logger.log_event("init", {"test": True})
        logger.log_step(1, 10, 0.1, 1.8, 0.0002)

        lines = log_file.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(lines), 2)
        p1 = json.loads(lines[0])
        self.assertEqual(p1["event"], "init")
        p2 = json.loads(lines[1])
        self.assertEqual(p2["event"], "step")
        self.assertEqual(p2["percent"], 10.0)

    def test_run_training_dry_run_and_cancellation(self):
        t_file = self.tmp_dir / "train.jsonl"
        e_file = self.tmp_dir / "eval.jsonl"
        rec = {"messages": [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}]}
        t_file.write_text(json.dumps(rec) + "\n", encoding="utf-8")
        e_file.write_text(json.dumps({"messages": [{"role": "user", "content": "other"}, {"role": "assistant", "content": "ans"}]}) + "\n", encoding="utf-8")

        cfg = TrainingConfig(
            output_dir=str(self.tmp_dir / "job1"),
            train_file=str(t_file),
            eval_file=str(e_file),
            num_epochs=1,
            batch_size=1,
            logging_steps=1,
        )
        res = run_training(cfg, dry_run=True)
        self.assertTrue(res["ok"])
        self.assertTrue((self.tmp_dir / "job1" / "adapter" / "adapter_config.json").exists())

        # Test recovery
        status = recover_incomplete_job(self.tmp_dir / "job1")
        self.assertEqual(status["status"], "completed")


if __name__ == "__main__":
    unittest.main()
