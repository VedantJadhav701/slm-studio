"""SQLite vector and metadata store for SLM Studio RAG.

Uses Python standard library sqlite3 and binary packing for vectors.
"""

from __future__ import annotations

import json
import sqlite3
import struct
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .chunker import Chunk


def _pack_vector(vec: List[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _unpack_vector(blob: bytes) -> List[float]:
    count = len(blob) // 4
    return list(struct.unpack(f"{count}f", blob))


def _dot_product(v1: List[float], v2: List[float]) -> float:
    if len(v1) != len(v2):
        return 0.0
    return sum(a * b for a, b in zip(v1, v2))


class SQLiteVectorStore:
    """Persistent SQLite store for document chunks and vector embeddings."""

    def __init__(self, db_path: Union[str, Path]):
        self.db_path = str(Path(db_path).resolve())
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    doc_id TEXT PRIMARY KEY,
                    source_file TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    created_at REAL NOT NULL DEFAULT (strftime('%s', 'now'))
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_id TEXT PRIMARY KEY,
                    doc_id TEXT NOT NULL,
                    source_file TEXT NOT NULL,
                    section TEXT NOT NULL,
                    line_start INTEGER NOT NULL,
                    line_end INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    vector_blob BLOB NOT NULL,
                    metadata_json TEXT NOT NULL,
                    FOREIGN KEY(doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id)")
            conn.commit()

    def add_document(
        self,
        doc_id: str,
        source_file: str,
        chunks: List[Chunk],
        vectors: List[List[float]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        if len(chunks) != len(vectors):
            raise ValueError(f"Chunks ({len(chunks)}) and vectors ({len(vectors)}) count mismatch")

        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO documents (doc_id, source_file, metadata_json) VALUES (?, ?, ?)",
                (doc_id, source_file, json.dumps(metadata or {}, ensure_ascii=False)),
            )
            # Remove previous chunks for this document
            conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))

            rows = []
            for chunk, vec in zip(chunks, vectors):
                rows.append((
                    chunk.chunk_id,
                    doc_id,
                    chunk.source_file,
                    chunk.section,
                    chunk.line_start,
                    chunk.line_end,
                    chunk.text,
                    _pack_vector(vec),
                    json.dumps(chunk.metadata, ensure_ascii=False),
                ))

            conn.executemany(
                """INSERT INTO chunks
                   (chunk_id, doc_id, source_file, section, line_start, line_end, text, vector_blob, metadata_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                rows,
            )
            conn.commit()

    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        min_score: float = -1.0,
    ) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT chunk_id, doc_id, source_file, section, line_start, line_end, text, vector_blob, metadata_json FROM chunks"
            )
            scored: List[Tuple[float, sqlite3.Row]] = []
            for row in cursor:
                vec = _unpack_vector(row["vector_blob"])
                score = _dot_product(query_vector, vec)
                if score >= min_score:
                    scored.append((score, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, row in scored[:top_k]:
            meta = {}
            try:
                meta = json.loads(row["metadata_json"])
            except Exception:
                pass
            results.append({
                "chunk_id": row["chunk_id"],
                "doc_id": row["doc_id"],
                "source_file": row["source_file"],
                "section": row["section"],
                "line_start": row["line_start"],
                "line_end": row["line_end"],
                "text": row["text"],
                "metadata": meta,
                "score": round(float(score), 4),
            })
        return results

    def count(self) -> int:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT COUNT(*) FROM chunks")
            return int(cur.fetchone()[0])

    def list_documents(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT doc_id, source_file, metadata_json, created_at FROM documents")
            docs = []
            for r in cur:
                docs.append({
                    "doc_id": r["doc_id"],
                    "source_file": r["source_file"],
                    "created_at": r["created_at"],
                })
            return docs

    def clear(self) -> None:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM chunks")
            conn.execute("DELETE FROM documents")
            conn.commit()
