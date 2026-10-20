"""Section-aware document chunker for SLM Studio RAG.

Preserves document identity, sections, line numbers, and date metadata.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    source_file: str
    section: str
    line_start: int
    line_end: int
    text: str
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


HEADER_PATTERN = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
DATE_PATTERN = re.compile(
    r"\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b"
)


def extract_date(text: str) -> Optional[str]:
    match = DATE_PATTERN.search(text)
    return match.group(1) if match else None


def chunk_document(
    text: str,
    source_file: str,
    doc_id: Optional[str] = None,
    doc_metadata: Optional[Dict[str, Any]] = None,
    max_chunk_chars: int = 1200,
    min_chunk_chars: int = 80,
    overlap_chars: int = 150,
) -> List[Chunk]:
    """Splits a document into section-aware chunks with line numbers and metadata."""
    if not text or not text.strip():
        return []

    if doc_id is None:
        doc_id = source_file

    meta = dict(doc_metadata or {})
    doc_date = meta.get("date") or extract_date(text)
    if doc_date:
        meta["date"] = doc_date

    lines = text.splitlines(keepends=True)
    total_lines = len(lines)

    # 1. Identify sections by headers
    sections: List[Dict[str, Any]] = []
    current_title = "Overview"
    current_start = 1
    current_lines: List[str] = []

    for idx, line in enumerate(lines, start=1):
        match = HEADER_PATTERN.match(line.rstrip("\r\n"))
        if match and current_lines:
            sections.append({
                "title": current_title,
                "start_line": current_start,
                "end_line": idx - 1,
                "lines": current_lines,
            })
            current_title = match.group(2).strip()
            current_start = idx
            current_lines = [line]
        elif match and not current_lines:
            current_title = match.group(2).strip()
            current_start = idx
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        sections.append({
            "title": current_title,
            "start_line": current_start,
            "end_line": total_lines,
            "lines": current_lines,
        })

    # 2. Chunk each section respecting paragraphs and line boundaries
    chunks: List[Chunk] = []
    chunk_counter = 0

    for sec in sections:
        sec_title = sec["title"]
        sec_lines = sec["lines"]
        sec_start = sec["start_line"]

        # Group lines into paragraphs or small blocks
        buffer: List[str] = []
        buf_start = sec_start
        buf_len = 0

        for line_idx, line in enumerate(sec_lines, start=sec_start):
            line_len = len(line)
            if buf_len + line_len > max_chunk_chars and buf_len >= min_chunk_chars:
                # Flush current buffer
                chunk_counter += 1
                chunk_text = "".join(buffer).strip()
                chunk_date = extract_date(chunk_text) or meta.get("date")
                chunk_meta = dict(meta)
                if chunk_date:
                    chunk_meta["date"] = chunk_date

                chunks.append(
                    Chunk(
                        chunk_id=f"{doc_id}:{chunk_counter}",
                        doc_id=doc_id,
                        source_file=source_file,
                        section=sec_title,
                        line_start=buf_start,
                        line_end=line_idx - 1,
                        text=chunk_text,
                        metadata=chunk_meta,
                    )
                )

                # Overlap: keep recent lines if possible
                overlap_lines: List[str] = []
                overlap_len = 0
                for rev in reversed(buffer):
                    if overlap_len + len(rev) <= overlap_chars:
                        overlap_lines.insert(0, rev)
                        overlap_len += len(rev)
                    else:
                        break

                buffer = list(overlap_lines)
                buf_start = line_idx - len(overlap_lines)
                buf_len = overlap_len

            buffer.append(line)
            buf_len += line_len

        if buffer:
            chunk_text = "".join(buffer).strip()
            if chunk_text:
                chunk_counter += 1
                chunk_date = extract_date(chunk_text) or meta.get("date")
                chunk_meta = dict(meta)
                if chunk_date:
                    chunk_meta["date"] = chunk_date

                chunks.append(
                    Chunk(
                        chunk_id=f"{doc_id}:{chunk_counter}",
                        doc_id=doc_id,
                        source_file=source_file,
                        section=sec_title,
                        line_start=buf_start,
                        line_end=sec["end_line"],
                        text=chunk_text,
                        metadata=chunk_meta,
                    )
                )

    return chunks
