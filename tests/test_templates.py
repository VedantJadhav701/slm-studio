"""Unit tests for Alpaca, ChatML, and Llama 3 formatting templates."""

import unittest
from slmstudio.train.template import apply_template, format_alpaca, format_chatml, format_llama3


class TestTemplatesExtended(unittest.TestCase):
    def setUp(self):
        self.conversation = [
            {"role": "system", "content": "You are a coding assistant."},
            {"role": "user", "content": "Write hello world."},
            {"role": "assistant", "content": "print('hello world')"},
        ]

    def test_alpaca_formatting(self):
        text = format_alpaca(self.conversation)
        self.assertIn("### Instruction:", text)
        self.assertIn("You are a coding assistant.", text)
        self.assertIn("### Response:", text)
        self.assertIn("print('hello world')", text)

    def test_chatml_formatting(self):
        text = format_chatml(self.conversation)
        self.assertIn("<|im_start|>system\nYou are a coding assistant.<|im_end|>", text)
        self.assertIn("<|im_start|>user\nWrite hello world.<|im_end|>", text)

    def test_llama3_formatting(self):
        text = format_llama3(self.conversation)
        self.assertIn("<|start_header_id|>system<|end_header_id|>", text)
        self.assertIn("<|start_header_id|>assistant<|end_header_id|>", text)
        self.assertIn("<|eot_id|>", text)


if __name__ == "__main__":
    unittest.main()
