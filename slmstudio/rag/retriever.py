"""Retriever module connecting queries, embeddings, and the SQLite vector store."""

from __future__ import annotations

from typing import Any, Dict, List

from .embeddings import EmbeddingBackend
from .store import SQLiteVectorStore


class Retriever:
    """Retrieves the most relevant chunks for a user query."""

    def __init__(self, store: SQLiteVectorStore, embedder: EmbeddingBackend):
        self.store = store
        self.embedder = embedder

    def retrieve(
        self,
        query: str,
        top_k: int = 3,
        min_score: float = 0.05,
    ) -> List[Dict[str, Any]]:
        if not query or not query.strip():
            return []
        query_vec = self.embedder.embed_text(query)
        return self.store.search(query_vec, top_k=top_k, min_score=min_score)
