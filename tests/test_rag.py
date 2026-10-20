"""Unit tests for SLM Studio RAG components."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from slmstudio.rag import (
    Chunk,
    DeterministicFakeEmbedding,
    Retriever,
    SQLiteVectorStore,
    build_rag_prompt,
    chunk_document,
    run_evaluation,
)
from slmstudio.rag.eval import compute_keyword_recall, compute_token_f1


class TestRAGComponents(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="slm-rag-test-")
        self.db_path = Path(self.tmp_dir) / "test_rag.sqlite"

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_chunk_document_preserves_sections_and_metadata(self):
        sample_doc = (
            "# Introduction\n"
            "This company was founded on 2024-01-15.\n"
            "We build on-premise local-first AI software for organizations.\n\n"
            "## Architecture\n"
            "The architecture consists of an Electron shell and a Python pipeline.\n"
            "All data stays on the user machine with zero telemetry.\n"
        )
        chunks = chunk_document(sample_doc, source_file="doc.md", max_chunk_chars=200)
        self.assertGreaterEqual(len(chunks), 2)
        # Check sections
        sections = [c.section for c in chunks]
        self.assertIn("Introduction", sections)
        self.assertIn("Architecture", sections)
        # Check date metadata extraction
        self.assertEqual(chunks[0].metadata.get("date"), "2024-01-15")
        # Line numbers
        self.assertGreaterEqual(chunks[0].line_start, 1)
        self.assertGreaterEqual(chunks[0].line_end, chunks[0].line_start)

    def test_deterministic_fake_embedding(self):
        embedder = DeterministicFakeEmbedding(dim=64)
        v1 = embedder.embed_text("local machine model inference")
        v2 = embedder.embed_text("local machine model inference")
        v3 = embedder.embed_text("completely different baking recipes and ingredients")

        # Deterministic: identical text produces identical vector
        self.assertEqual(v1, v2)
        self.assertEqual(len(v1), 64)

        # Dot product with identical text is 1.0
        dot_self = sum(a * b for a, b in zip(v1, v2))
        self.assertAlmostEqual(dot_self, 1.0, places=4)

        # Different text produces lower similarity
        dot_diff = sum(a * b for a, b in zip(v1, v3))
        self.assertLess(dot_diff, dot_self)

    def test_sqlite_vector_store_and_retrieval(self):
        store = SQLiteVectorStore(self.db_path)
        embedder = DeterministicFakeEmbedding(dim=64)

        chunks = [
            Chunk(
                chunk_id="chunk-1",
                doc_id="doc1",
                source_file="hr_policy.md",
                section="Vacation",
                line_start=10,
                line_end=20,
                text="Employees receive 25 days of paid annual leave each year.",
                metadata={"category": "hr"},
            ),
            Chunk(
                chunk_id="chunk-2",
                doc_id="doc1",
                source_file="it_policy.md",
                section="Security",
                line_start=1,
                line_end=15,
                text="Passwords must be at least 16 characters and changed every 90 days.",
                metadata={"category": "it"},
            ),
        ]
        vectors = embedder.embed_batch([c.text for c in chunks])
        store.add_document("doc1", "hr_policy.md", chunks, vectors)

        self.assertEqual(store.count(), 2)

        retriever = Retriever(store=store, embedder=embedder)
        results = retriever.retrieve("How many annual leave days for vacation?", top_k=1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["chunk_id"], "chunk-1")
        self.assertEqual(results[0]["section"], "Vacation")

    def test_prompt_builder_cites_sources(self):
        retrieved = [
            {
                "chunk_id": "c1",
                "source_file": "manual.md",
                "section": "Quick Start",
                "line_start": 12,
                "line_end": 18,
                "text": "Run `npm start` to launch the application.",
                "score": 0.88,
            }
        ]
        prompt_data = build_rag_prompt("How to start the app?", retrieved)
        self.assertIn("citations", prompt_data)
        self.assertEqual(len(prompt_data["citations"]), 1)
        self.assertEqual(prompt_data["citations"][0]["source_file"], "manual.md")
        self.assertEqual(prompt_data["citations"][0]["line_start"], 12)

        messages = prompt_data["messages"]
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("cite sources", messages[0]["content"].lower())
        self.assertIn("manual.md:12-18", messages[1]["content"])

    def test_evaluation_runner(self):
        store = SQLiteVectorStore(self.db_path)
        embedder = DeterministicFakeEmbedding(dim=64)

        chunk = Chunk(
            chunk_id="c1",
            doc_id="d1",
            source_file="data.txt",
            section="Guide",
            line_start=1,
            line_end=5,
            text="The secret access code is 4492.",
            metadata={},
        )
        store.add_document("d1", "data.txt", [chunk], embedder.embed_batch([chunk.text]))

        eval_file = Path(self.tmp_dir) / "eval.jsonl"
        eval_record = {
            "messages": [
                {"role": "user", "content": "What is the secret access code?"},
                {"role": "assistant", "content": "The secret access code is 4492."},
            ]
        }
        eval_file.write_text(json.dumps(eval_record) + "\n", encoding="utf-8")

        res = run_evaluation(
            eval_jsonl_path=str(eval_file),
            output_dir=self.tmp_dir,
            store=store,
            embedder=embedder,
            base_model="test-model",
            ollama_client=None,
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["summary"]["records_evaluated"], 1)
        self.assertIn("scores", res["summary"])
        out_json = Path(self.tmp_dir) / "rag_eval_results.json"
        self.assertTrue(out_json.exists())

    def test_eval_metric_calculations(self):
        f1_perfect = compute_token_f1("the fast brown fox", "the fast brown fox")
        self.assertAlmostEqual(f1_perfect, 1.0)
        f1_zero = compute_token_f1("apple banana", "car truck")
        self.assertEqual(f1_zero, 0.0)

        recall_half = compute_keyword_recall("one two", "one two three four")
        self.assertAlmostEqual(recall_half, 0.5)


if __name__ == "__main__":
    unittest.main()
