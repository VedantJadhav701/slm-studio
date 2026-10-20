"""Command-line entry point used by the desktop app.

Every command prints exactly one JSON object to stdout and exits 0 on success,
1 on a handled error. Diagnostics go to stderr. The Electron main process parses
stdout, so nothing else may be printed there.

Commands:
    prepare   --files F [F ...] --out DIR [--eval-fraction 0.1]
    hardware
    version
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import __version__
from .ingest import SUPPORTED_SUFFIXES
from .pipeline import run as run_pipeline
from .pipeline import _write_cpt, _write_jsonl
from .hardware import detect
from .recommend import recommend
from .ollama import OllamaClient, OllamaConnectionError, OllamaError
from .rag import (
    SQLiteVectorStore,
    chunk_document,
    get_embedding_backend,
    Retriever,
    build_rag_prompt,
    run_evaluation,
)

MAX_FILE_BYTES = 512 * 1024 * 1024  # 512 MB per file; larger files need splitting first
MIN_EVAL_FRACTION = 0.02
MAX_EVAL_FRACTION = 0.5


class CliError(Exception):
    pass


def _emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _check_files(files: List[str]) -> List[str]:
    if not files:
        raise CliError("no files were given")
    checked = []
    for f in files:
        p = Path(f)
        if not p.is_file():
            raise CliError(f"file not found: {p.name}")
        if p.suffix.lower() not in SUPPORTED_SUFFIXES:
            raise CliError(f"{p.name}: unsupported file type '{p.suffix}'")
        size = p.stat().st_size
        if size == 0:
            raise CliError(f"{p.name}: file is empty")
        if size > MAX_FILE_BYTES:
            raise CliError(f"{p.name}: larger than {MAX_FILE_BYTES // (1024 * 1024)} MB; split it first")
        checked.append(str(p))
    return checked


def cmd_prepare(args: argparse.Namespace) -> Dict[str, Any]:
    if not (MIN_EVAL_FRACTION <= args.eval_fraction <= MAX_EVAL_FRACTION):
        raise CliError(
            f"eval fraction must be between {MIN_EVAL_FRACTION} and {MAX_EVAL_FRACTION}"
        )
    files = _check_files(args.files)
    result = run_pipeline(files, eval_fraction=args.eval_fraction)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    _write_jsonl(out / "train.jsonl", result["train"])
    _write_jsonl(out / "eval.jsonl", result["eval"])
    if result["cpt"]:
        _write_cpt(out / "cpt.jsonl", result["cpt"])
    report = result["report"]
    (out / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return {"ok": True, "out_dir": str(out.resolve()), "report": report}


def cmd_hardware(_: argparse.Namespace) -> Dict[str, Any]:
    hw = detect()
    return {"ok": True, "hardware": hw.to_dict(), "recommendation": recommend(hw)}


def cmd_version(_: argparse.Namespace) -> Dict[str, Any]:
    return {"ok": True, "version": __version__, "python": sys.version.split()[0]}


def cmd_ollama_status(args: argparse.Namespace) -> Dict[str, Any]:
    client = OllamaClient(base_url=args.url)
    try:
        status = client.status()
        return {"ok": True, **status}
    except (OllamaConnectionError, OllamaError) as exc:
        raise CliError(str(exc))


def cmd_rag_index(args: argparse.Namespace) -> Dict[str, Any]:
    files = _check_files(args.files)
    store = SQLiteVectorStore(args.db)
    embedder = get_embedding_backend(kind=args.embedder, base_url=args.ollama_url)

    total_chunks = 0
    indexed_docs = 0

    for file_path in files:
        p = Path(file_path)
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                text = p.read_text(encoding="latin-1")
            except Exception as e:
                raise CliError(f"Failed to read {p.name}: {e}")

        chunks = chunk_document(text, source_file=p.name, doc_id=p.name)
        if not chunks:
            continue

        chunk_texts = [c.text for c in chunks]
        try:
            vectors = embedder.embed_batch(chunk_texts)
        except Exception as e:
            raise CliError(f"Embedding failed: {e}")

        store.add_document(doc_id=p.name, source_file=p.name, chunks=chunks, vectors=vectors)
        total_chunks += len(chunks)
        indexed_docs += 1

    return {
        "ok": True,
        "indexed_docs": indexed_docs,
        "total_chunks": total_chunks,
        "total_store_chunks": store.count(),
        "db": str(Path(args.db).resolve()),
    }


def cmd_rag_query(args: argparse.Namespace) -> Dict[str, Any]:
    store = SQLiteVectorStore(args.db)
    embedder = get_embedding_backend(kind=args.embedder, base_url=args.ollama_url)
    retriever = Retriever(store=store, embedder=embedder)

    retrieved = retriever.retrieve(args.query, top_k=args.top_k, min_score=args.min_score)
    prompt_data = build_rag_prompt(args.query, retrieved, system_instruction=args.system)

    return {
        "ok": True,
        "query": args.query,
        "retrieved_count": len(retrieved),
        "citations": prompt_data["citations"],
        "messages": prompt_data["messages"],
        "context_text": prompt_data["context_text"],
    }


def cmd_rag_eval(args: argparse.Namespace) -> Dict[str, Any]:
    store = SQLiteVectorStore(args.db)
    embedder = get_embedding_backend(kind=args.embedder, base_url=args.ollama_url)
    client = OllamaClient(base_url=args.ollama_url) if args.use_ollama else None

    result = run_evaluation(
        eval_jsonl_path=args.eval_file,
        output_dir=args.out,
        store=store,
        embedder=embedder,
        base_model=args.model,
        ollama_client=client,
        max_records=args.max_records,
    )
    return result


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="slmstudio", description="SLM Studio core CLI")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("prepare", help="validate and split company data")
    p.add_argument("--files", nargs="+", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--eval-fraction", type=float, default=0.1)
    p.set_defaults(func=cmd_prepare)

    h = sub.add_parser("hardware", help="detect hardware and recommend models")
    h.set_defaults(func=cmd_hardware)

    v = sub.add_parser("version", help="print core version")
    v.set_defaults(func=cmd_version)

    os_p = sub.add_parser("ollama-status", help="check status of Ollama server")
    os_p.add_argument("--url", default="http://127.0.0.1:11434")
    os_p.set_defaults(func=cmd_ollama_status)

    ri = sub.add_parser("rag-index", help="chunk, embed, and index documents into SQLite")
    ri.add_argument("--files", nargs="+", required=True)
    ri.add_argument("--db", required=True)
    ri.add_argument("--embedder", choices=["fake", "ollama"], default="fake")
    ri.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    ri.set_defaults(func=cmd_rag_index)

    rq = sub.add_parser("rag-query", help="retrieve context and format citation prompt")
    rq.add_argument("--query", required=True)
    rq.add_argument("--db", required=True)
    rq.add_argument("--embedder", choices=["fake", "ollama"], default="fake")
    rq.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    rq.add_argument("--top-k", type=int, default=3)
    rq.add_argument("--min-score", type=float, default=0.0)
    rq.add_argument("--system", default=None)
    rq.set_defaults(func=cmd_rag_query)

    re_p = sub.add_parser("rag-eval", help="evaluate base model vs base-with-RAG on eval.jsonl")
    re_p.add_argument("--eval-file", required=True)
    re_p.add_argument("--db", required=True)
    re_p.add_argument("--out", required=True)
    re_p.add_argument("--model", default="llama3.2:1b")
    re_p.add_argument("--embedder", choices=["fake", "ollama"], default="fake")
    re_p.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    re_p.add_argument("--use-ollama", action="store_true")
    re_p.add_argument("--max-records", type=int, default=50)
    re_p.set_defaults(func=cmd_rag_eval)
    return ap


def main(argv: Optional[List[str]] = None) -> int:
    ap = build_parser()
    args = ap.parse_args(argv)
    try:
        payload = args.func(args)
        _emit(payload)
        return 0
    except CliError as exc:
        _emit({"ok": False, "error": str(exc)})
        return 1
    except Exception as exc:  # last-resort: never let a traceback reach the UI
        print(f"internal error: {type(exc).__name__}: {exc}", file=sys.stderr)
        _emit({"ok": False, "error": "internal error while processing the request; see logs"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
