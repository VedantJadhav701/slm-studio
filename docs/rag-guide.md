# RAG Architecture & Grounding Manual

Retrieval-Augmented Generation (RAG) is the optimal path when data is primarily factual, frequently updated, or requires strict verifiable source citations.

## The Ingestion & Chunking Pipeline

1. **Header-Aware Chunking**: Markdown headers (`#`, `##`, `###`) delineate semantic document sections.
2. **Metadata Preservation**: Every chunk retains:
   - `doc_id` & `source_file`
   - `section` name
   - `line_start` and `line_end`
   - Inferred date timestamps
3. **SQLite Vector Storage**: Chunks and their normalized float vectors are stored in `rag_store.sqlite` using SQLite's binary BLOB storage and vector dot-product scoring.

## Source Citations

When a user submits a query:
1. Retriever fetches the top-$k$ relevant chunks using cosine similarity.
2. Prompt builder formats context passages with bracketed references: `[1] doc.md:12-25 (Architecture)`.
3. The UI extracts structured citation cards displaying the file, line span, section header, and text preview directly under the model's answer.
