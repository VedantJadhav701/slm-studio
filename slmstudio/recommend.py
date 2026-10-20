"""Memory estimate and model-tier recommendation.

Rough but conservative. Formula (inference, weights + KV cache + overhead):

    weights_gb = params_b * bytes_per_param(quant)
    kv_gb      = small constant per 1B params for the chosen context length
    total_gb   = (weights_gb + kv_gb) * OVERHEAD

The numbers are estimates for planning, not guarantees. The app must still let the
user try a model and show the real memory use it observed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .hardware import HardwareProfile

BYTES_PER_PARAM = {"q4": 0.6, "q8": 1.1, "fp16": 2.0}  # q4 includes block scales
OVERHEAD = 1.2
TRAINING_LORA_MULTIPLIER = 3.0  # rough: activations + optimizer state for LoRA


@dataclass
class ModelOption:
    name: str
    params_b: float
    tier: str  # "small" | "medium" | "large"


# Catalog is deliberately short. Replace with benchmarked entries before release.
CATALOG: List[ModelOption] = [
    ModelOption("qwen3-0.6b", 0.6, "small"),
    ModelOption("qwen3-1.7b", 1.7, "small"),
    ModelOption("qwen3-4b", 4.0, "medium"),
    ModelOption("qwen3-8b", 8.0, "large"),
]


def inference_gb(params_b: float, quant: str = "q4", kv_gb: float = 0.5) -> float:
    return round((params_b * BYTES_PER_PARAM[quant] + kv_gb) * OVERHEAD, 2)


def training_gb(params_b: float) -> float:
    return round(params_b * BYTES_PER_PARAM["fp16"] * TRAINING_LORA_MULTIPLIER, 2)


def usable_memory_gb(hw: HardwareProfile) -> Optional[float]:
    """Memory a model can use. Discrete GPU VRAM wins; otherwise RAM with headroom."""
    if hw.gpu_vram_gb:
        return hw.gpu_vram_gb * 0.85
    if hw.gpu_vendor == "apple" and hw.ram_gb:
        return hw.ram_gb * 0.6  # unified memory shared with the OS
    if hw.ram_gb:
        return hw.ram_gb * 0.5  # CPU inference: leave room for the OS and app
    return None


def recommend(hw: HardwareProfile) -> dict:
    budget = usable_memory_gb(hw)
    if budget is None:
        return {
            "status": "unknown",
            "message": "Could not detect memory. Start with the smallest model and check it runs.",
            "models": [CATALOG[0].name],
            "can_lora_train": False,
            "can_full_finetune": False,
        }

    fits = [m for m in CATALOG if inference_gb(m.params_b) <= budget]
    best = fits[-1] if fits else None
    lora_ok = best is not None and training_gb(best.params_b) <= budget
    return {
        "status": "ok" if best else "too_small",
        "usable_memory_gb": round(budget, 1),
        "models": [m.name for m in fits] if fits else [],
        "recommended": best.name if best else None,
        "can_lora_train": bool(lora_ok),
        "can_full_finetune": False,  # full fine-tuning is disabled in the MVP
        "message": _message(best, lora_ok, budget),
    }


def _message(best: Optional[ModelOption], lora_ok: bool, budget: float) -> str:
    if best is None:
        return (f"About {budget:.1f} GB is available, which is below the smallest "
                "supported model. Consider a machine with more memory.")
    if not lora_ok:
        return (f"{best.name} can run here, but LoRA training on it likely needs more memory. "
                "Use a smaller model for training or train on a GPU machine.")
    return f"{best.name} is recommended for inference and LoRA training on this machine."
