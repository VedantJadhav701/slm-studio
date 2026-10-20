# Model Catalog & Support Matrix

SLM Studio adheres to a strict model catalog policy: every listed model has been evaluated on consistent benchmark suites and holds a commercially permissive license for on-premise execution.

| Model | Parameters | Quantization | Est. Memory (Inference) | Est. VRAM (LoRA SFT) | Context Window | Permissive Commercial License |
|---|---|---|---|---|---|---|
| **Llama 3.2 1B** | 1.23B | 4-bit (NF4/Q4) | 1.1 GB | ~3.5 GB | 8,192 | Llama 3.2 Community License |
| **Llama 3.2 3B** | 3.21B | 4-bit (NF4/Q4) | 2.2 GB | ~5.8 GB | 8,192 | Llama 3.2 Community License |
| **Qwen 2.5 0.5B** | 0.49B | 4-bit / 8-bit | 0.6 GB | ~2.5 GB | 32,768 | Apache 2.0 |
| **Qwen 2.5 1.5B** | 1.54B | 4-bit (NF4/Q4) | 1.3 GB | ~4.0 GB | 32,768 | Apache 2.0 |
| **Phi-3.5 Mini** | 3.82B | 4-bit (Q4_K_M) | 2.4 GB | ~6.5 GB | 128,000 | MIT |
| **Gemma 2 2B** | 2.61B | 4-bit (Q4_K_M) | 1.8 GB | ~5.2 GB | 8,192 | Gemma Terms of Use |

## Hardware Feasibility Tiers

- **Tier 1 (NVIDIA GPU with 8+ GB VRAM)**: Full support for 4-bit and 8-bit LoRA SFT up to 3B models.
- **Tier 2 (Apple Silicon M-series with 16+ GB RAM)**: Metal accelerated MLX/PyTorch fine-tuning and inference.
- **Tier 3 (CPU-only or Integrated Graphics)**: Fast RAG hybrid retrieval and small model inference. Training operates in simulation / CPU fallback mode with warning badges.
