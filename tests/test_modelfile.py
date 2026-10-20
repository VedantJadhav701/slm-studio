"""Dedicated unit tests for Ollama Modelfile parameter generation."""

import unittest
from slmstudio.export import generate_modelfile


class TestModelfileExtended(unittest.TestCase):
    def test_custom_stop_tokens_and_temperature(self):
        mf = generate_modelfile(
            base_model_or_path="qwen2.5:1.5b",
            template="{{ .Prompt }}",
            parameters={"temperature": 0.2, "top_p": 0.95, "stop": ["<|endoftext|>", "<|im_end|>"]},
        )
        self.assertIn("FROM qwen2.5:1.5b", mf)
        self.assertIn("PARAMETER temperature 0.2", mf)
        self.assertIn("PARAMETER top_p 0.95", mf)
        self.assertIn("PARAMETER stop <|endoftext|>", mf)
        self.assertIn("PARAMETER stop <|im_end|>", mf)

    def test_system_prompt_escaping(self):
        mf = generate_modelfile(
            base_model_or_path="llama3.2:1b",
            system_prompt="Multi-line\nsystem\nprompt",
        )
        self.assertIn("SYSTEM \"\"\"Multi-line\nsystem\nprompt\"\"\"", mf)


if __name__ == "__main__":
    unittest.main()
