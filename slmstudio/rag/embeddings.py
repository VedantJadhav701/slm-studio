"""Embedding backend interface, deterministic test fake, and local Ollama backend."""

from __future__ import annotations

import hashlib
import math
import re
from typing import List, Protocol

from ..ollama import OllamaClient


class EmbeddingBackend(Protocol):
    def embed_text(self, text: str) -> List[float]:
        ...

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        ...


def _cosine_norm(vec: List[float]) -> List[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    if norm < 1e-9:
        return [0.0] * len(vec)
    return [v / norm for v in vec]


class DeterministicFakeEmbedding:
    """Fast, deterministic fake embedding generator for testing without external services.

    Generates normalised N-dimensional vectors where overlapping words and themes produce
    measurable similarity, with identical text producing exact match.
    """

    def __init__(self, dim: int = 64):
        self.dim = dim

    def embed_text(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.dim

        tokens = re.findall(r"\w+", text.lower())
        vec = [0.0] * self.dim

        for token in tokens:
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if ((h >> 8) & 1) else -1.0
            vec[idx] += sign

        # Global hash bias for uniqueness
        full_h = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
        for i in range(self.dim):
            bit = (full_h >> (i % 64)) & 1
            vec[i] += 0.05 * (1.0 if bit else -1.0)

        return _cosine_norm(vec)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in texts]


class OllamaEmbeddingBackend:
    """Local embedding backend backed by Ollama."""

    def __init__(
        self,
        model: str = "nomic-embed-text",
        base_url: str = "http://127.0.0.1:11434",
    ):
        self.model = model
        self.client = OllamaClient(base_url=base_url)

    def embed_text(self, text: str) -> List[float]:
        vec = self.client.embeddings(model=self.model, prompt=text)
        return _cosine_norm(vec)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in texts]


def get_embedding_backend(
    kind: str = "fake",
    model: str = "nomic-embed-text",
    base_url: str = "http://127.0.0.1:11434",
    dim: int = 64,
) -> EmbeddingBackend:
    if kind == "ollama":
        return OllamaEmbeddingBackend(model=model, base_url=base_url)
    return DeterministicFakeEmbedding(dim=dim)
