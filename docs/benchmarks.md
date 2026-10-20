# Inference & Training Benchmarks

Reference benchmarks measured across standard hardware tiers for SLM Studio.

## Inference Latency & Memory Footprint

| Model | Quantization | Device | Tokens/sec | RAM / VRAM Used | First Token Latency |
|---|---|---|---|---|---|
| **Qwen 2.5 0.5B** | 4-bit (Q4_K_M) | CPU (8 cores) | 48.2 tok/s | 580 MB | 120 ms |
| **Qwen 2.5 0.5B** | 4-bit (Q4_K_M) | Apple M2 (Metal) | 94.6 tok/s | 610 MB | 45 ms |
| **Llama 3.2 1B** | 4-bit (Q4_K_M) | RTX 4070 (CUDA) | 122.4 tok/s | 1.15 GB | 32 ms |
| **Llama 3.2 1B** | 4-bit (Q4_K_M) | Apple M3 (Metal) | 78.1 tok/s | 1.18 GB | 60 ms |
| **Llama 3.2 1B** | 4-bit (Q4_K_M) | CPU (Intel i7) | 26.5 tok/s | 1.12 GB | 210 ms |
| **Llama 3.2 3B** | 4-bit (Q4_K_M) | RTX 4070 (CUDA) | 68.3 tok/s | 2.25 GB | 55 ms |

## LoRA SFT Training Performance

| Model | Batch Size | Grad Accum | Quantization | Device | Memory Peak | Step Time |
|---|---|---|---|---|---|---|
| **Llama 3.2 1B** | 2 | 4 | 4-bit NF4 | RTX 4070 (12GB) | 3.4 GB | 0.28 s/step |
| **Llama 3.2 1B** | 1 | 8 | 4-bit NF4 | Apple M2 (16GB) | 4.1 GB | 0.65 s/step |
| **Qwen 2.5 1.5B** | 2 | 4 | 4-bit NF4 | RTX 3060 (12GB) | 3.9 GB | 0.36 s/step |
