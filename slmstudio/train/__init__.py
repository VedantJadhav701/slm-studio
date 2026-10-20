"""Training sidecar package for SLM Studio (LoRA SFT)."""

from .cancel import CancellationHandler, recover_incomplete_job
from .config import TrainingConfig
from .dataset import load_and_validate_datasets
from .hardware_check import check_training_feasibility
from .progress import ProgressLogger
from .template import apply_template
from .trainer import run_training

__all__ = [
    "TrainingConfig",
    "check_training_feasibility",
    "load_and_validate_datasets",
    "apply_template",
    "ProgressLogger",
    "CancellationHandler",
    "recover_incomplete_job",
    "run_training",
]
