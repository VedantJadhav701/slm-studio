# Model Export & Ollama Deployment Guide

Once LoRA fine-tuning is complete, the resulting model can be packaged and served locally via Ollama.

## Export Workflow

1. **Adapter Merging**:
   - The low-rank delta weights are merged back into the base model weights:
     $$W_{\text{final}} = W_{\text{base}} + \frac{\alpha}{r}(A \times B)$$
2. **GGUF Conversion**:
   - Weights are converted to the standard GGUF binary format using `convert_hf_to_gguf.py`.
3. **Quantization**:
   - `llama-quantize` quantizes the GGUF model into `Q4_K_M` or `Q8_0` for optimal inference speed and memory efficiency.
4. **Modelfile Generation & Registration**:
   - A `Modelfile` is written containing the base GGUF model, system prompt, and stop tokens.
   - `ollama create <name> -f Modelfile` registers the new model in the local Ollama catalog.

## Verification Command
```bash
ollama run custom-slm "What is our company annual leave policy?"
```
