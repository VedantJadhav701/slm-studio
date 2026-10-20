"""Best-effort hardware detection. Never raises; unknown values are None.

Uses only the standard library plus optional system commands. Missing tools simply
produce None, and the recommender treats None as "unknown, be conservative".
"""

from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class HardwareProfile:
    os: str
    cpu_model: Optional[str]
    cpu_cores: Optional[int]
    ram_gb: Optional[float]
    gpu_name: Optional[str]
    gpu_vram_gb: Optional[float]
    gpu_vendor: Optional[str]  # "nvidia" | "amd" | "apple" | None

    def to_dict(self) -> dict:
        return asdict(self)


def _run(cmd: list[str]) -> Optional[str]:
    if not shutil.which(cmd[0]):
        return None
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False)
        return out.stdout if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _ram_gb() -> Optional[float]:
    try:
        if hasattr(os, "sysconf"):
            pages = os.sysconf("SC_PHYS_PAGES")
            page_size = os.sysconf("SC_PAGE_SIZE")
            if pages > 0 and page_size > 0:
                return round(pages * page_size / 1024**3, 1)
    except (ValueError, OSError):
        pass
    out = _run(["wmic", "computersystem", "get", "TotalPhysicalMemory", "/value"])
    if out:
        m = re.search(r"TotalPhysicalMemory=(\d+)", out)
        if m:
            return round(int(m.group(1)) / 1024**3, 1)
    return None


def _cpu_model() -> Optional[str]:
    system = platform.system()
    if system == "Darwin":
        out = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
        return out.strip() if out else platform.processor() or None
    if system == "Linux":
        try:
            with open("/proc/cpuinfo", encoding="utf-8") as fh:
                for line in fh:
                    if line.lower().startswith("model name"):
                        return line.split(":", 1)[1].strip()
        except OSError:
            pass
    return platform.processor() or None


def _gpu() -> tuple[Optional[str], Optional[float], Optional[str]]:
    out = _run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
    if out:
        first = out.strip().splitlines()[0]
        name, _, mem = first.rpartition(",")
        try:
            return name.strip(), round(float(mem.strip()) / 1024, 1), "nvidia"
        except ValueError:
            return name.strip() or None, None, "nvidia"
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        # Apple Silicon uses unified memory; treat RAM as the usable GPU pool.
        return "Apple Silicon (unified memory)", None, "apple"
    out = _run(["rocm-smi", "--showmeminfo", "vram", "--json"])
    if out:
        m = re.search(r'"VRAM Total Memory \(B\)":\s*"(\d+)"', out)
        vram = round(int(m.group(1)) / 1024**3, 1) if m else None
        return "AMD GPU", vram, "amd"
    return None, None, None


def detect() -> HardwareProfile:
    gpu_name, gpu_vram, vendor = _gpu()
    return HardwareProfile(
        os=f"{platform.system()} {platform.release()}".strip(),
        cpu_model=_cpu_model(),
        cpu_cores=os.cpu_count(),
        ram_gb=_ram_gb(),
        gpu_name=gpu_name,
        gpu_vram_gb=gpu_vram,
        gpu_vendor=vendor,
    )
