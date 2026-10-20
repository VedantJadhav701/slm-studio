"""Version and build metadata provider for SLM Studio."""

from __future__ import annotations

import platform
import sys
from . import __version__


def get_version_info() -> dict:
    return {
        "version": __version__,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "arch": platform.machine(),
        "license": "Apache-2.0",
        "local_first": True,
    }
