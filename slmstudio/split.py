"""Deterministic train / eval split.

Assignment is by hash of the record's canonical content, not by position, so:
  - the same record always lands in the same split across runs and machines
  - adding new records does not reshuffle existing ones
  - duplicates were already removed, so eval never contains a training example
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Tuple


def _bucket(rec: Dict[str, Any], seed: str) -> float:
    payload = json.dumps(rec["messages"], sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(f"{seed}\x1f{payload}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def split_records(
    records: List[Dict[str, Any]],
    eval_fraction: float = 0.1,
    seed: str = "slmstudio-v1",
    min_eval: int = 1,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (train, eval). Raises if the fraction is out of range."""
    if not 0.0 < eval_fraction < 1.0:
        raise ValueError("eval_fraction must be between 0 and 1 (exclusive)")
    train, evals = [], []
    for rec in records:
        (evals if _bucket(rec, seed) < eval_fraction else train).append(rec)

    # Guarantee a usable eval set on very small datasets.
    if len(evals) < min_eval and len(train) > min_eval:
        ranked = sorted(train, key=lambda r: _bucket(r, seed))
        moved = ranked[:min_eval]
        moved_ids = {id(r) for r in moved}
        evals.extend(moved)
        train = [r for r in train if id(r) not in moved_ids]
    return train, evals
