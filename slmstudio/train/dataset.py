"""Dataset loader and zero-overlap validator for LoRA SFT training."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple


def _fingerprint_record(messages: List[Dict[str, str]]) -> str:
    """Computes a deterministic normalized fingerprint of conversation messages."""
    normalized = []
    for m in messages:
        role = m.get("role", "").strip().lower()
        content = " ".join(m.get("content", "").strip().lower().split())
        normalized.append(f"{role}:{content}")
    return hashlib.sha256("\n".join(normalized).encode("utf-8")).hexdigest()


def load_and_validate_datasets(
    train_path: str | Path,
    eval_path: str | Path,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """Loads train and eval datasets and enforces the non-negotiable zero-overlap rule."""
    t_file = Path(train_path)
    e_file = Path(eval_path)

    errors = []
    if not t_file.exists():
        errors.append(f"Train file does not exist: {t_file}")
    if not e_file.exists():
        errors.append(f"Eval file does not exist: {e_file}")

    if errors:
        return [], [], errors

    train_records = []
    eval_records = []

    with t_file.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if "messages" not in rec or not isinstance(rec["messages"], list):
                    errors.append(f"Train row {idx}: missing valid messages list")
                else:
                    train_records.append(rec)
            except Exception as e:
                errors.append(f"Train row {idx}: invalid JSON: {e}")

    with e_file.open("r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if "messages" not in rec or not isinstance(rec["messages"], list):
                    errors.append(f"Eval row {idx}: missing valid messages list")
                else:
                    eval_records.append(rec)
            except Exception as e:
                errors.append(f"Eval row {idx}: invalid JSON: {e}")

    if not train_records:
        errors.append("Training dataset contains 0 valid records.")
    if not eval_records:
        errors.append("Evaluation dataset contains 0 valid records.")

    # Non-negotiable: Check for any train/eval overlap
    eval_hashes: Set[str] = set()
    for rec in eval_records:
        eval_hashes.add(_fingerprint_record(rec["messages"]))

    overlap_count = 0
    clean_train_records = []
    for rec in train_records:
        h = _fingerprint_record(rec["messages"])
        if h in eval_hashes:
            overlap_count += 1
        else:
            clean_train_records.append(rec)

    if overlap_count > 0:
        errors.append(
            f"Zero-overlap rule violated: {overlap_count} training records overlap with evaluation set. "
            "Excluding overlapping records from training."
        )
        train_records = clean_train_records

    return train_records, eval_records, errors
