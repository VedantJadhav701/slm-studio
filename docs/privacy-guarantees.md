# Privacy Guarantees & Enterprise Compliance

SLM Studio is specifically architected for regulated sectors (healthcare, legal, banking, engineering) where data egress is strictly prohibited.

## The Local-First Architecture

1. **Air-Gapped Operation**: SLM Studio operates in air-gapped environments without network connectivity.
2. **Local Vector Embeddings**: Document chunking, hashing, and vector storage occur strictly on local disk (`rag_store.sqlite`).
3. **No Cloud LLMs**: Models run via local Ollama on `127.0.0.1:11434`.
4. **Audit Logging**: Every agent action, prompt, and retrieval is logged to `audit.jsonl` with human approval checkpoints.
5. **No Analytics**: Zero Google Analytics, PostHog, Sentry, Mixpanel, or third-party telemetry scripts.
