"""Load user files into a flat list of raw records.

Each record is a dict with at least:
    _source  - file name
    _line    - 1-based line number (or row number for CSV, 1 for whole-file formats)
    ...      - the user's own fields, unchanged

Supported: .jsonl, .json, .csv, .tsv, .txt, .md
Unsupported formats raise UnsupportedFormatError with a clear message.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List

SUPPORTED_SUFFIXES = {".jsonl", ".json", ".csv", ".tsv", ".txt", ".md"}


class UnsupportedFormatError(ValueError):
    pass


class IngestError(ValueError):
    def __init__(self, source: str, line: int, message: str):
        super().__init__(f"{source}:{line}: {message}")
        self.source = source
        self.line = line


def load_file(path: str | Path) -> List[Dict[str, Any]]:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise UnsupportedFormatError(
            f"{path.name}: unsupported format '{suffix}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_SUFFIXES))}"
        )
    if suffix == ".jsonl":
        return list(_load_jsonl(path))
    if suffix == ".json":
        return list(_load_json(path))
    if suffix in {".csv", ".tsv"}:
        return list(_load_csv(path, delimiter="," if suffix == ".csv" else "\t"))
    return [_load_text(path)]


def _load_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as fh:
        for lineno, raw in enumerate(fh, start=1):
            text = raw.strip()
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                raise IngestError(path.name, lineno, f"invalid JSON: {exc.msg}") from exc
            if not isinstance(obj, dict):
                raise IngestError(path.name, lineno, "each JSONL line must be an object")
            yield {**obj, "_source": path.name, "_line": lineno}


def _load_json(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as fh:
        try:
            data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise IngestError(path.name, exc.lineno, f"invalid JSON: {exc.msg}") from exc
    if isinstance(data, dict):
        # Accept {"data": [...]} or {"records": [...]} wrappers.
        for key in ("data", "records", "examples", "items"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            data = [data]
    if not isinstance(data, list):
        raise IngestError(path.name, 1, "top-level JSON must be an array or object")
    for idx, obj in enumerate(data, start=1):
        if not isinstance(obj, dict):
            raise IngestError(path.name, idx, "each item must be an object")
        yield {**obj, "_source": path.name, "_line": idx}


def _load_csv(path: Path, delimiter: str) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=delimiter)
        if not reader.fieldnames:
            raise IngestError(path.name, 1, "CSV has no header row")
        for row_no, row in enumerate(reader, start=2):  # header is line 1
            yield {**{k: (v or "") for k, v in row.items() if k is not None},
                   "_source": path.name, "_line": row_no}


def _load_text(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8-sig")
    return {"text": text, "_source": path.name, "_line": 1}
