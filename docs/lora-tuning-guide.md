# LoRA Fine-Tuning Hyperparameters Manual

Low-Rank Adaptation (LoRA) freezes the base model weights and trains rank decomposition matrices across linear attention projections.

## Key Hyperparameters

| Parameter | Recommended Default | Description |
|---|---|---|
| **Rank ($r$)** | `16` | Rank of the update matrices. Higher values increase adapter capacity but require more VRAM. |
| **Alpha ($\alpha$)** | `32` | Scaling factor applied to the low-rank delta ($W = W_0 + \frac{\alpha}{r} \Delta W$). Typically $2 \times r$. |
| **Target Modules** | `q_proj, v_proj, k_proj, o_proj` | Layers injected with LoRA adapters. Attention projections yield the highest parameter efficiency. |
| **Quantization** | `4-bit (NF4)` | Base model loaded in 4-bit normal float with double quantization, drastically reducing VRAM. |
| **Learning Rate** | `2e-4` | AdamW learning rate with linear warmup and cosine decay. |
| **Gradient Accumulation** | `4` | Simulates larger effective batch sizes without incurring additional VRAM allocation. |

## Progress Supervision

The training sidecar writes step updates to `progress.jsonl`. The Electron app polls and displays:
- Percentage complete and current step
- Running cross-entropy loss
- Dynamic ETA based on rolling step velocity
- Current memory consumption in MB
