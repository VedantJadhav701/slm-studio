# Troubleshooting & Diagnostic FAQ

### 1. "Ollama is not running at http://127.0.0.1:11434"
- Ensure the Ollama background service is running by typing `ollama serve` or checking your system tray.
- If running Ollama inside Docker or WSL, set the Ollama address in Settings to `http://host.docker.internal:11434` or the appropriate WSL host IP.

### 2. "Python 3.10 or newer was not found"
- SLM Studio searches in order: `SLM_PYTHON` environment variable -> bundled distribution -> system `py` / `python3`.
- Set `SLM_PYTHON=C:\Path\To\python.exe` (Windows) or `export SLM_PYTHON=/usr/local/bin/python3` (macOS/Linux).

### 3. "CUDA out of memory during fine-tuning"
- Decrease batch size to 1 and increase gradient accumulation steps.
- Enable 4-bit NF4 quantization in the Training tab.
- Reduce sequence length from 2048 to 1024 tokens.

### 4. "Zero-overlap rule violated"
- The training pipeline detected records in `train.jsonl` that match questions in `eval.jsonl`.
- The pipeline automatically excludes overlapping pairs to prevent benchmark contamination.
