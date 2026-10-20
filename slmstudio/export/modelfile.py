"""Modelfile generator for creating runnable Ollama models from trained weights."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional


def generate_modelfile(
    base_model_or_path: str,
    adapter_path: Optional[str] = None,
    system_prompt: Optional[str] = None,
    template: Optional[str] = None,
    parameters: Optional[Dict[str, Any]] = None,
) -> str:
    """Creates a standardized Ollama Modelfile."""
    lines = [f"FROM {base_model_or_path}"]

    if adapter_path:
        lines.append(f"ADAPTER {adapter_path}")

    if template:
        lines.append(f'TEMPLATE """{template}"""')

    if system_prompt:
        lines.append(f'SYSTEM """{system_prompt.strip()}"""')

    default_params = {
        "temperature": 0.7,
        "top_p": 0.9,
        "stop": ["<|eot_id|>", "<|im_end|>", "</s>"],
    }
    merged_params = {**default_params, **(parameters or {})}

    for param, val in merged_params.items():
        if isinstance(val, list):
            for item in val:
                lines.append(f"PARAMETER {param} {item}")
        else:
            lines.append(f"PARAMETER {param} {val}")

    return "\n".join(lines) + "\n"


def write_modelfile(path: str | Path, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
