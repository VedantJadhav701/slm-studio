"""Ingest -> validate -> dedupe -> split -> report.

Run as a module:
    python3 -m slmstudio.pipeline <file> [<file> ...] --out build/ [--eval-fraction 0.1]

Writes:
    build/train.jsonl     canonical chat records for training
    build/eval.jsonl      held-out records, never overlapping training
    build/report.json     counts, issues, duplicates, and split sizes
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from .dedupe import dedupe
from .ingest import IngestError, UnsupportedFormatError, load_file
from .split import split_records
from .validate import validate_records


def run(paths: List[str], eval_fraction: float = 0.1) -> Dict[str, Any]:
    raw: List[Dict[str, Any]] = []
    load_errors: List[str] = []
    for p in paths:
        try:
            raw.extend(load_file(p))
        except (IngestError, UnsupportedFormatError, OSError) as exc:
            load_errors.append(str(exc))

    validation = validate_records(raw)
    sft_rows = [r for r in validation.records if r["_kind"] == "sft"]
    cpt_rows = [r for r in validation.records if r["_kind"] == "cpt"]
    kept, dups = dedupe(sft_rows)
    train, evals = split_records(kept, eval_fraction=eval_fraction)

    return {
        "train": train,
        "eval": evals,
        "cpt": cpt_rows,
        "report": {
            "files": [Path(p).name for p in paths],
            "rows_read": len(raw),
            "rows_valid": len(validation.records),
            "rows_invalid": len(validation.issues),
            "duplicates_removed": len(dups),
            "duplicates_exact": sum(1 for d in dups if d.get("_dup_kind") == "exact"),
            "duplicates_near": sum(1 for d in dups if d.get("_dup_kind") == "near"),
            "train_size": len(train),
            "eval_size": len(evals),
            "kinds": validation.kinds,
            "load_errors": load_errors,
            "invalid_examples": [str(i) for i in validation.issues[:50]],
            "warnings": _warnings(len(kept), len(evals), validation.kinds),
        },
    }


def _warnings(total: int, n_eval: int, kinds: Dict[str, int]) -> List[str]:
    out = []
    if total == 0:
        out.append("No valid records. Check the file format and the invalid examples.")
    if 0 < total < 200:
        out.append("Fewer than 200 records. Expect weak results from fine-tuning; RAG is a better starting point.")
    if kinds.get("cpt", 0) and kinds.get("sft", 0):
        out.append("Mixed SFT and plain-text records. Train them in separate runs.")
    if n_eval == 0 and total > 0:
        out.append("Evaluation set is empty; results cannot be measured.")
    return out


def _write_jsonl(path: Path, rows: List[Dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps({"messages": r["messages"]}, ensure_ascii=False) + "\n")


def _write_cpt(path: Path, rows: List[Dict[str, Any]]) -> None:
    # Continued pretraining takes raw text, not chat messages.
    with path.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps({"text": r["messages"][0]["content"]}, ensure_ascii=False) + "\n")


def main(argv: List[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Prepare company data for SLM training.")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default="build")
    ap.add_argument("--eval-fraction", type=float, default=0.1)
    args = ap.parse_args(argv)

    result = run(args.files, eval_fraction=args.eval_fraction)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    _write_jsonl(out / "train.jsonl", result["train"])
    _write_jsonl(out / "eval.jsonl", result["eval"])
    if result["cpt"]:
        _write_cpt(out / "cpt.jsonl", result["cpt"])
    (out / "report.json").write_text(json.dumps(result["report"], indent=2, ensure_ascii=False), encoding="utf-8")

    r = result["report"]
    print(f"valid={r['rows_valid']} invalid={r['rows_invalid']} "
          f"dups={r['duplicates_removed']} train={r['train_size']} eval={r['eval_size']}")
    for w in r["warnings"]:
        print(f"warning: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
