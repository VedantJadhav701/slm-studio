"""Output constraint validation and parser for structured tool calling."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple
from .tools import TOOLS


def parse_and_validate_tool_call(raw_text: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """Extracts and verifies that the model output strictly conforms to a registered tool call schema."""
    cleaned = raw_text.strip()
    if not cleaned:
        return False, None, "Empty model response."

    # Locate JSON block if wrapped in markdown
    if "```json" in cleaned:
        parts = cleaned.split("```json")
        cleaned = parts[1].split("```")[0].strip()
    elif "```" in cleaned:
        parts = cleaned.split("```")
        cleaned = parts[1].split("```")[0].strip()

    try:
        data = json.loads(cleaned)
    except Exception as e:
        return False, None, f"Model output is not valid JSON: {e}"

    tool_name = data.get("name") or data.get("tool")
    arguments = data.get("parameters") or data.get("arguments") or {}

    if not tool_name or tool_name not in TOOLS:
        return False, None, f"Unknown or disallowed tool '{tool_name}'."

    tool_def = TOOLS[tool_name]

    # Validate parameters
    for p in tool_def.parameters:
        if p.required and p.name not in arguments:
            return False, None, f"Missing required parameter '{p.name}' for tool '{tool_name}'."
        if p.name in arguments and p.enum_values:
            val = str(arguments[p.name]).lower()
            if val not in [ev.lower() for ev in p.enum_values]:
                return False, None, f"Value '{val}' not in allowed enum {p.enum_values} for parameter '{p.name}'."

    return True, {
        "tool": tool_name,
        "arguments": arguments,
        "requires_approval": tool_def.requires_approval,
    }, "Valid"
