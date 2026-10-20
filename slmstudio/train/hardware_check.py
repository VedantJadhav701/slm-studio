"""Pre-flight hardware verification for LoRA SFT training sidecar."""

from __future__ import annotations

import sys
from typing import Any, Dict, List, Tuple
from ..hardware import detect


def check_training_feasibility(
    base_model_size_b: float = 1.0,
    quantization: str = "4bit",
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Evaluates whether the local machine can feasibly train the target model."""
    hw = detect()
    warnings: List[str] = []
    errors: List[str] = []

    # Memory requirement calculation in GB
    if quantization == "4bit":
        est_vram_gb = base_model_size_b * 0.7 + 2.0
    elif quantization == "8bit":
        est_vram_gb = base_model_size_b * 1.2 + 2.5
    else:
        est_vram_gb = base_model_size_b * 2.2 + 4.0

    gpu_available = hw.gpu_vendor is not None
    vram_gb = hw.gpu_vram_gb or 0.0
    ram_gb = hw.ram_gb or 0.0

    is_apple = hw.gpu_vendor == "apple"
    if is_apple:
        # Apple Silicon unified memory
        if ram_gb < 16.0:
            warnings.append(
                f"Apple Silicon unified memory is {ram_gb:.1f} GB. LoRA SFT is supported but may swap if RAM < 16 GB."
            )
        can_train = ram_gb >= (est_vram_gb + 4.0)
    elif hw.gpu_vendor == "nvidia":
        if vram_gb < est_vram_gb:
            warnings.append(
                f"NVIDIA VRAM ({vram_gb:.1f} GB) is below estimated {est_vram_gb:.1f} GB. Activation checkpointing enabled."
            )
        can_train = True
    elif hw.gpu_vendor == "amd":
        warnings.append(
            "AMD GPU detected. ROCm training is best-effort and experimental in v1."
        )
        can_train = True
    else:
        # CPU training
        warnings.append(
            "No compatible discrete GPU detected. LoRA training will run on CPU, which is significantly slower."
        )
        can_train = ram_gb >= (est_vram_gb * 1.5)

    if not can_train:
        errors.append(f"Insufficient system memory: available RAM {ram_gb:.1f} GB is below required threshold.")

    profile = {
        "can_train": can_train,
        "estimated_vram_required_gb": round(est_vram_gb, 2),
        "available_vram_gb": vram_gb,
        "available_ram_gb": ram_gb,
        "gpu_vendor": hw.gpu_vendor,
        "is_apple_silicon": is_apple,
        "device": "cuda" if hw.gpu_vendor == "nvidia" else ("mps" if is_apple else "cpu"),
    }

    return can_train, warnings + errors, profile
