"""Evaluation runner comparing base model versus base-with-RAG on held-out eval.jsonl."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..ollama import OllamaClient
from .embeddings import EmbeddingBackend
from .prompt import build_rag_prompt
from .retriever import Retriever
from .store import SQLiteVectorStore


def _tokenize(text: str) -> List[str]:
    return re.findall(r"\w+", text.lower())


def compute_token_f1(prediction: str, ground_truth: str) -> float:
    pred_tokens = _tokenize(prediction)
    truth_tokens = _tokenize(ground_truth)
    if not pred_tokens or not truth_tokens:
        return 1.0 if pred_tokens == truth_tokens else 0.0

    common = set(pred_tokens) & set(truth_tokens)
    if not common:
        return 0.0

    precision = len(common) / len(set(pred_tokens))
    recall = len(common) / len(set(truth_tokens))
    return (2 * precision * recall) / (precision + recall)


def compute_keyword_recall(prediction: str, ground_truth: str) -> float:
    truth_tokens = set(_tokenize(ground_truth))
    if not truth_tokens:
        return 1.0
    pred_tokens = set(_tokenize(prediction))
    return len(truth_tokens & pred_tokens) / len(truth_tokens)


def run_evaluation(
    eval_jsonl_path: str,
    output_dir: str,
    store: SQLiteVectorStore,
    embedder: EmbeddingBackend,
    base_model: str,
    ollama_client: Optional[OllamaClient] = None,
    max_records: int = 50,
) -> Dict[str, Any]:
    """Runs evaluation comparing Base vs Base+RAG on eval.jsonl and writes results."""
    eval_file = Path(eval_jsonl_path)
    if not eval_file.exists():
        raise FileNotFoundError(f"Eval file not found: {eval_file}")

    records = []
    with eval_file.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except Exception:
                    pass

    records = records[:max_records]
    if not records:
        raise ValueError("No valid evaluation records found.")

    retriever = Retriever(store=store, embedder=embedder)
    eval_items: List[Dict[str, Any]] = []

    base_f1_sum = 0.0
    rag_f1_sum = 0.0
    base_recall_sum = 0.0
    rag_recall_sum = 0.0

    for idx, rec in enumerate(records):
        messages = rec.get("messages", [])
        user_msg = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
        ground_truth = next((m.get("content", "") for m in messages if m.get("role") == "assistant"), "")

        if not user_msg:
            continue

        # 1. Base model response
        base_resp = ""
        if ollama_client:
            try:
                res = ollama_client.chat(model=base_model, messages=[{"role": "user", "content": user_msg}])
                base_resp = res.get("message", {}).get("content", "")
            except Exception as e:
                base_resp = f"[Ollama query failed: {e}]"
        else:
            base_resp = f"[Simulated base response for {user_msg[:30]}]"

        # 2. RAG response
        retrieved = retriever.retrieve(user_msg, top_k=3)
        rag_prompt_data = build_rag_prompt(user_msg, retrieved)
        rag_resp = ""
        if ollama_client:
            try:
                res = ollama_client.chat(model=base_model, messages=rag_prompt_data["messages"])
                rag_resp = res.get("message", {}).get("content", "")
            except Exception as e:
                rag_resp = f"[Ollama RAG query failed: {e}]"
        else:
            context_snippet = retrieved[0]["text"][:50] if retrieved else ""
            rag_resp = f"[Simulated RAG with context: {context_snippet}]"

        b_f1 = compute_token_f1(base_resp, ground_truth)
        r_f1 = compute_token_f1(rag_resp, ground_truth)
        b_rec = compute_keyword_recall(base_resp, ground_truth)
        r_rec = compute_keyword_recall(rag_resp, ground_truth)

        base_f1_sum += b_f1
        rag_f1_sum += r_f1
        base_recall_sum += b_rec
        rag_recall_sum += r_rec

        eval_items.append({
            "index": idx + 1,
            "query": user_msg,
            "ground_truth": ground_truth,
            "base": {"response": base_resp, "token_f1": round(b_f1, 4), "keyword_recall": round(b_rec, 4)},
            "rag": {
                "response": rag_resp,
                "token_f1": round(r_f1, 4),
                "keyword_recall": round(r_rec, 4),
                "citations": rag_prompt_data["citations"],
            },
        })

    n = max(1, len(eval_items))
    avg_base_f1 = round(base_f1_sum / n, 4)
    avg_rag_f1 = round(rag_f1_sum / n, 4)
    avg_base_recall = round(base_recall_sum / n, 4)
    avg_rag_recall = round(rag_recall_sum / n, 4)

    summary = {
        "model": base_model,
        "records_evaluated": len(eval_items),
        "scores": {
            "base": {"avg_f1": avg_base_f1, "avg_recall": avg_base_recall},
            "rag": {"avg_f1": avg_rag_f1, "avg_recall": avg_rag_recall},
            "rag_delta_f1": round(avg_rag_f1 - avg_base_f1, 4),
        },
        "recommendation": (
            "RAG provides stronger grounding on factual documentation."
            if avg_rag_f1 >= avg_base_f1
            else "Base model performance is comparable on this eval set."
        ),
    }

    result = {
        "ok": True,
        "summary": summary,
        "items": eval_items,
    }

    out_path = Path(output_dir) / "rag_eval_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    return result
