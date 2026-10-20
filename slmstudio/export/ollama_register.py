"""Registers exported models with local Ollama via the Ollama CLI or HTTP API."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def build_ollama_create_command(
    model_name: str,
    modelfile_path: str | Path,
) -> List[str]:
    """Generates the command: ollama create <name> -f <modelfile>."""
    return ["ollama", "create", model_name, "-f", str(Path(modelfile_path).resolve())]


def register_model_with_ollama(
    model_name: str,
    modelfile_path: str | Path,
) -> Dict[str, Any]:
    """Registers the model with local Ollama instance and returns the execution report."""
    cmd = build_ollama_create_command(model_name, modelfile_path)

    if not shutil.which("ollama"):
        return {
            "ok": False,
            "error": "Ollama CLI is not installed or not available on PATH.",
            "command": " ".join(cmd),
            "exit_code": 127,
        }

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        return {
            "ok": proc.returncode == 0,
            "command": " ".join(cmd),
            "exit_code": proc.returncode,
            "output": (proc.stdout + "\n" + proc.stderr).strip(),
            "model_name": model_name,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "command": " ".join(cmd),
            "exit_code": 1,
        }
