# Frequently Asked Questions (FAQ)

### Can I run SLM Studio completely offline?
Yes. Once models are downloaded through Ollama, SLM Studio requires zero internet connection. Data preparation, chunking, SQLite indexing, LoRA training, and inference operate 100% on-premise.

### What is the minimum machine requirement?
- **CPU**: Modern x86_64 or Apple Silicon ARM processor.
- **RAM**: 8 GB minimum for inference of 0.5B-1B models; 16 GB recommended.
- **GPU**: NVIDIA GPU with 8+ GB VRAM recommended for fast LoRA fine-tuning.

### How does RAG differ from LoRA fine-tuning in SLM Studio?
- **RAG**: Best for dynamic documents, policy lookups, and questions needing exact source citations.
- **LoRA Fine-Tuning**: Best for teaching the model specialized communication style, ticket classification rules, or constrained JSON tool calling formats.

### Where does SLM Studio store files?
Projects and temporary files are stored in `Documents/SLM Studio/` by default. This can be configured in Settings.
