#!/usr/bin/env python3
"""Diagnostic utility to inspect local system environment for SLM Studio."""

import shutil
import sys
from slmstudio.hardware import detect
from slmstudio.ollama import OllamaClient


def main():
    print("=" * 60)
    print("SLM Studio Environment Health Check")
    print("=" * 60)

    # 1. Python Check
    py_ver = sys.version.split()[0]
    print(f"Python: {py_ver} ({'PASS' if sys.version_info >= (3, 10) else 'FAIL - Requires 3.10+'})")

    # 2. Node Check
    node_bin = shutil.which("node")
    print(f"Node.js executable: {node_bin or 'Not found'}")

    # 3. Hardware Profile
    hw = detect()
    print(f"OS: {hw.os}")
    print(f"CPU: {hw.cpu_model or 'Unknown'} ({hw.cpu_cores or 0} cores)")
    print(f"RAM: {hw.ram_gb or 0:.1f} GB")
    print(f"GPU: {hw.gpu_name or 'None'} (Vendor: {hw.gpu_vendor or 'none'}, VRAM: {hw.gpu_vram_gb or 0:.1f} GB)")

    # 4. Ollama Check
    ollama_bin = shutil.which("ollama")
    print(f"Ollama CLI: {ollama_bin or 'Not installed'}")

    client = OllamaClient()
    try:
        status = client.status()
        print(f"Ollama Service: RUNNING ({len(status.get('models', []))} models installed)")
    except Exception:
        print("Ollama Service: NOT REACHABLE (Check if ollama serve is running)")

    print("=" * 60)
    print("Ready for SLM Studio local execution!")
    print("=" * 60)


if __name__ == "__main__":
    main()
