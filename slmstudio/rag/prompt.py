"""Prompt builder for RAG queries that formats retrieved context and cites sources."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def build_rag_prompt(
    query: str,
    retrieved: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    """Formats retrieved context into structured messages and extracts clean source citations."""
    citations = []
    context_blocks = []

    for idx, item in enumerate(retrieved, start=1):
        source_name = item.get("source_file", "document")
        line_start = item.get("line_start", 1)
        line_end = item.get("line_end", line_start)
        section = item.get("section", "General")
        text = item.get("text", "").strip()

        cite_ref = f"[{idx}] {source_name}:{line_start}-{line_end} ({section})"
        context_blocks.append(f"--- Context {cite_ref} ---\n{text}")

        citations.append({
            "index": idx,
            "source_file": source_name,
            "section": section,
            "line_start": line_start,
            "line_end": line_end,
            "score": item.get("score", 0.0),
            "preview": text[:200] + ("..." if len(text) > 200 else ""),
        })

    default_system = (
        "You are an on-premise AI assistant running locally via SLM Studio. "
        "Answer the question accurately based on the provided context. "
        "If the context does not contain enough information, state clearly that the answer is not found in the documents. "
        "Cite sources using bracketed references like [1], [2] corresponding to the context sections."
    )
    sys_content = (system_instruction.strip() + "\n\n") if system_instruction else ""
    sys_content += default_system

    context_str = "\n\n".join(context_blocks)
    if context_str:
        user_content = f"Context information:\n\n{context_str}\n\nQuestion: {query}"
    else:
        user_content = query

    messages = [
        {"role": "system", "content": sys_content},
        {"role": "user", "content": user_content},
    ]

    return {
        "messages": messages,
        "citations": citations,
        "context_text": context_str,
    }
