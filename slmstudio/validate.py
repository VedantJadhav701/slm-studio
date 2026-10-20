"""Validate records for supervised fine-tuning (SFT).

Accepted shapes (per record):
  1. Chat:        {"messages": [{"role": "user"|"assistant"|"system", "content": "..."}, ...]}
  2. Instruction: {"instruction": "...", "output": "...", "input": "..."(optional)}
  3. Q/A:         {"question": "...", "answer": "..."}
  4. Plain text:  {"text": "..."}   (only useful for continued pretraining; flagged as CPT)

Each record is converted to the canonical chat form:
  {"messages": [...], "_kind": "sft" | "cpt", "_source": ..., "_line": ...}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

VALID_ROLES = {"system", "user", "assistant"}
MIN_CONTENT_CHARS = 2


@dataclass
class Issue:
    source: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.source}:{self.line}: {self.message}"


@dataclass
class ValidationResult:
    records: List[Dict[str, Any]] = field(default_factory=list)
    issues: List[Issue] = field(default_factory=list)

    @property
    def kinds(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for r in self.records:
            counts[r["_kind"]] = counts.get(r["_kind"], 0) + 1
        return counts


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _to_messages(rec: Dict[str, Any]) -> Tuple[str | None, List[Dict[str, str]] | None, str | None]:
    """Return (kind, messages, error). Exactly one of messages/error is set."""
    if "messages" in rec:
        raw = rec["messages"]
        if not isinstance(raw, list) or not raw:
            return None, None, "'messages' must be a non-empty list"
        msgs = []
        for i, m in enumerate(raw):
            if not isinstance(m, dict):
                return None, None, f"messages[{i}] must be an object"
            role = m.get("role")
            content = _text(m.get("content"))
            if role not in VALID_ROLES:
                return None, None, f"messages[{i}].role must be one of {sorted(VALID_ROLES)}"
            if len(content) < MIN_CONTENT_CHARS:
                return None, None, f"messages[{i}].content is empty or too short"
            msgs.append({"role": role, "content": content})
        if not any(m["role"] == "assistant" for m in msgs):
            return None, None, "chat record needs at least one assistant message to learn from"
        return "sft", msgs, None

    if "instruction" in rec or "output" in rec:
        instruction = _text(rec.get("instruction"))
        output = _text(rec.get("output"))
        extra = _text(rec.get("input"))
        if len(instruction) < MIN_CONTENT_CHARS or len(output) < MIN_CONTENT_CHARS:
            return None, None, "instruction and output are both required and must be non-empty"
        user = instruction if not extra else f"{instruction}\n\n{extra}"
        return "sft", [{"role": "user", "content": user}, {"role": "assistant", "content": output}], None

    if "question" in rec or "answer" in rec:
        q = _text(rec.get("question"))
        a = _text(rec.get("answer"))
        if len(q) < MIN_CONTENT_CHARS or len(a) < MIN_CONTENT_CHARS:
            return None, None, "question and answer are both required and must be non-empty"
        return "sft", [{"role": "user", "content": q}, {"role": "assistant", "content": a}], None

    if "text" in rec:
        text = _text(rec.get("text"))
        if len(text) < 20:
            return None, None, "text record is too short to be useful"
        return "cpt", [{"role": "user", "content": text}], None  # stored as raw text, see pipeline

    return None, None, (
        "unrecognised record shape. Use one of: messages[], instruction/output, "
        "question/answer, or text"
    )


def validate_records(records: List[Dict[str, Any]]) -> ValidationResult:
    result = ValidationResult()
    for rec in records:
        source = rec.get("_source", "?")
        line = rec.get("_line", 0)
        kind, msgs, err = _to_messages(rec)
        if err:
            result.issues.append(Issue(source, line, err))
            continue
        result.records.append({
            "messages": msgs,
            "_kind": kind,
            "_source": source,
            "_line": line,
        })
    return result
