"""Training configuration schema and hyperparameter validation for SLM Studio."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class TrainingConfig:
    base_model: str = "llama3.2:1b"
    output_dir: str = "build/adapter"
    train_file: str = "build/train.jsonl"
    eval_file: str = "build/eval.jsonl"
    learning_rate: float = 2e-4
    num_epochs: int = 3
    batch_size: int = 2
    gradient_accumulation_steps: int = 4
    max_seq_length: int = 1024
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: List[str] = field(default_factory=lambda: ["q_proj", "v_proj", "k_proj", "o_proj"])
    quantization: str = "4bit"  # "4bit", "8bit", "none"
    seed: int = 42
    save_steps: int = 50
    logging_steps: int = 5

    def validate(self) -> List[str]:
        errors = []
        if not self.base_model or not isinstance(self.base_model, str):
            errors.append("base_model must be a valid model identifier")
        if self.learning_rate <= 0 or self.learning_rate > 0.01:
            errors.append("learning_rate must be between 0 and 0.01")
        if self.num_epochs < 1 or self.num_epochs > 50:
            errors.append("num_epochs must be between 1 and 50")
        if self.batch_size < 1:
            errors.append("batch_size must be at least 1")
        if self.lora_r < 1 or self.lora_r > 256:
            errors.append("lora_r must be between 1 and 256")
        if self.max_seq_length < 64 or self.max_seq_length > 8192:
            errors.append("max_seq_length must be between 64 and 8192")
        if self.quantization not in ("4bit", "8bit", "none"):
            errors.append("quantization must be '4bit', '8bit', or 'none'")
        return errors

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TrainingConfig:
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)

    def save_json(self, path: Path | str) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")
