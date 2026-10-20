"""RAG (Retrieval Augmented Generation) package for SLM Studio."""

from .chunker import Chunk, chunk_document
from .embeddings import (
    DeterministicFakeEmbedding,
    EmbeddingBackend,
    OllamaEmbeddingBackend,
    get_embedding_backend,
)
from .eval import run_evaluation
from .prompt import build_rag_prompt
from .retriever import Retriever
from .store import SQLiteVectorStore

__all__ = [
    "Chunk",
    "chunk_document",
    "EmbeddingBackend",
    "DeterministicFakeEmbedding",
    "OllamaEmbeddingBackend",
    "get_embedding_backend",
    "SQLiteVectorStore",
    "Retriever",
    "build_rag_prompt",
    "run_evaluation",
]
