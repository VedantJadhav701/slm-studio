"""Unit tests for SLM Studio export, Modelfile generation, and GGUF quantization commands."""

import tempfile
import unittest
from pathlib import Path

from slmstudio.export import (
    SUPPORTED_QUANTIZATIONS,
    build_gguf_conversion_command,
    build_ollama_create_command,
    build_quantize_command,
    generate_modelfile,
    write_modelfile,
)


class TestExportModules(unittest.TestCase):
    def test_generate_modelfile_basic(self):
        mf = generate_modelfile(
            base_model_or_path="llama3.2:1b",
            adapter_path="./adapter",
            system_prompt="You are a helpful domain assistant.",
        )
        self.assertIn("FROM llama3.2:1b", mf)
        self.assertIn("ADAPTER ./adapter", mf)
        self.assertIn("SYSTEM \"\"\"You are a helpful domain assistant.\"\"\"", mf)
        self.assertIn("PARAMETER temperature 0.7", mf)

    def test_write_modelfile(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_file = Path(tmp) / "Modelfile"
            content = generate_modelfile("llama3.2:1b")
            write_modelfile(out_file, content)
            self.assertTrue(out_file.exists())
            self.assertEqual(out_file.read_text(encoding="utf-8"), content)

    def test_gguf_conversion_command(self):
        cmd = build_gguf_conversion_command("my_model_dir", "model.f16.gguf", "f16")
        self.assertEqual(cmd[0], "python")
        self.assertIn("--outfile", cmd)
        self.assertIn("model.f16.gguf", cmd)

    def test_quantize_command(self):
        cmd = build_quantize_command("model.f16.gguf", "model.q4.gguf", "Q4_K_M")
        self.assertIn("llama-quantize", cmd[0])
        self.assertEqual(cmd[1], "model.f16.gguf")
        self.assertEqual(cmd[2], "model.q4.gguf")
        self.assertEqual(cmd[3], "Q4_K_M")

    def test_unsupported_quantization_raises(self):
        with self.assertRaises(ValueError):
            build_quantize_command("in.gguf", "out.gguf", "Q99_INVALID")

    def test_ollama_create_command(self):
        cmd = build_ollama_create_command("custom-slm", "Modelfile")
        self.assertEqual(cmd[0], "ollama")
        self.assertEqual(cmd[1], "create")
        self.assertEqual(cmd[2], "custom-slm")
        self.assertEqual(cmd[3], "-f")


if __name__ == "__main__":
    unittest.main()
