"""Deduplication for normalised records.

Two passes:
  1. exact  - identical canonical JSON of the messages
  2. fuzzy-normalised - same text after lowercasing, collapsing whitespace, and
     stripping punctuation (catches copy-paste variants of the same record)

The first occurrence is kept; later ones are reported as duplicates.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Tuple

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE = re.compile(r"\s+")


def _normalise(text: str) -> str:
    text = text.lower()
    text = _PUNCT.sub(" ", text)
    return _SPACE.sub(" ", text).strip()


def _fingerprint(rec: Dict[str, Any], normalised: bool) -> str:
    msgs = rec["messages"]
    if normalised:
        return json.dumps(
            [[m["role"], _normalise(m["content"])] for m in msgs], ensure_ascii=False
        )
    return json.dumps(msgs, sort_keys=True, ensure_ascii=False)


def dedupe(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (kept, duplicates). Duplicates carry a '_duplicate_of' pointer."""
    seen_exact: Dict[str, Dict[str, Any]] = {}
    seen_norm: Dict[str, Dict[str, Any]] = {}
    kept: List[Dict[str, Any]] = []
    dups: List[Dict[str, Any]] = []

    for rec in records:
        exact_key = _fingerprint(rec, normalised=False)
        norm_key = _fingerprint(rec, normalised=True)
        if exact_key in seen_exact:
            dups.append({**rec, "_duplicate_of": _where(seen_exact[exact_key]), "_dup_kind": "exact"})
            continue
        if norm_key in seen_norm:
            dups.append({**rec, "_duplicate_of": _where(seen_norm[norm_key]), "_dup_kind": "near"})
            continue
        seen_exact[exact_key] = rec
        seen_norm[norm_key] = rec
        kept.append(rec)
    return kept, dups


def _where(rec: Dict[str, Any]) -> str:
    return f"{rec.get('_source', '?')}:{rec.get('_line', '?')}"
