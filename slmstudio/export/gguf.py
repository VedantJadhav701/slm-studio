"""GGUF conversion and quantisation command generator for local deployment."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SUPPORTED_QUANTIZATIONS = ["Q4_K_M", "Q4_0", "Q5_K_M", "Q8_0", "F16"]


def build_gguf_conversion_command(
    model_dir: str | Path,
    out_file: str | Path,
    out_type: str = "f16",
    llama_cpp_convert_script: Optional[str] = None,
) -> List[str]:
    """Generates the command to convert HF/PEFT weights into GGUF."""
    script = llama_cpp_convert_script or "convert_hf_to_gguf.py"
    return [
        "python",
        script,
        str(model_dir),
        "--outfile",
        str(out_file),
        "--outtype",
        out_type.lower(),
    ]


def build_quantize_command(
    input_gguf: str | Path,
    output_gguf: str | Path,
    quant_method: str = "Q4_K_M",
    llama_quantize_bin: Optional[str] = None,
) -> List[str]:
    """Generates the llama-quantize command for integer weight quantization."""
    quant = quant_method.upper()
    if quant not in SUPPORTED_QUANTIZATIONS:
        raise ValueError(f"Unsupported quantization '{quant}'. Supported: {SUPPORTED_QUANTIZATIONS}")

    binary = llama_quantize_bin or "llama-quantize"
    return [binary, str(input_gguf), str(output_gguf), quant]


def execute_export_step(cmd: List[str], cwd: Optional[str] = None) -> Tuple[bool, int, str]:
    """Runs an export step without using shell and reports its command and exit code."""
    binary = shutil.which(cmd[0])
    if not binary and not Path(cmd[0]).exists():
        return False, 127, f"Executable '{cmd[0]}' not found on system PATH."

    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
        output = proc.stdout + ("\n" + proc.stderr if proc.stderr else "")
        return proc.returncode == 0, proc.returncode, output.strip()
    except Exception as e:
        return False, 1, str(e)
