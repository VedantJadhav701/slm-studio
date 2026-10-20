"""Prompt formatting templates for fine-tuning small language models."""

from __future__ import annotations

from typing import Dict, List


def format_chatml(messages: List[Dict[str, str]]) -> str:
    """Formats messages using the standard ChatML syntax (<|im_start|> ... <|im_end|>)."""
    blocks = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        blocks.append(f"<|im_start|>{role}\n{content}<|im_end|>")
    return "\n".join(blocks)


def format_llama3(messages: List[Dict[str, str]]) -> str:
    """Formats messages using the Llama 3 special token format."""
    blocks = ["<|begin_of_text|>"]
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        blocks.append(f"<|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>")
    return "".join(blocks)


def format_alpaca(messages: List[Dict[str, str]]) -> str:
    """Formats instruction-response pairs using the Alpaca template."""
    system_text = ""
    user_text = ""
    assistant_text = ""

    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            system_text = content
        elif role == "user":
            user_text = content
        elif role == "assistant":
            assistant_text = content

    out = ""
    if system_text:
        out += f"Below is an instruction that describes a task. Write a response that appropriately completes the request.\n\n### Instruction:\n{system_text}\n\n{user_text}\n\n### Response:\n{assistant_text}"
    else:
        out += f"Below is an instruction that describes a task. Write a response that appropriately completes the request.\n\n### Instruction:\n{user_text}\n\n### Response:\n{assistant_text}"
    return out


TEMPLATES = {
    "chatml": format_chatml,
    "llama3": format_llama3,
    "alpaca": format_alpaca,
}


def apply_template(messages: List[Dict[str, str]], template_name: str = "chatml") -> str:
    formatter = TEMPLATES.get(template_name.lower(), format_chatml)
    return formatter(messages)
