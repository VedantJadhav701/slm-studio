# Bundled Python Runtime

SLM Studio uses a local Python core for data ingestion, deduplication, hardware profiling, and RAG/training pipelines. To ensure seamless out-of-the-box operation for non-ML users without requiring manual Python installation, packaged releases bundle an isolated Python distribution.

## Target Bundled Distributions

| Platform | Distribution | Version | Source | Rationale |
|---|---|---|---|---|
| **Windows (x64)** | Windows embeddable package (`python-3.11.9-embed-amd64.zip`) | Python 3.11.9 | Official python.org embeddable distribution | Zero external system dependencies, ~25MB footprint, isolated from system registry and PATH, runs out-of-the-box. |
| **macOS (Universal2 / arm64)** | Relocatable standalone CPython build | Python 3.11.9 | `python-build-standalone` (astral-sh / indygreg) | Fully relocatable, codesign & hardened runtime compatible, avoids depending on Xcode or Homebrew. |
| **Linux (x64)** | Standalone relocatable distribution | Python 3.11.9 | `python-build-standalone` | Distro-agnostic, glibc compatible across LTS distributions. |

### Why Python 3.11?

1. **Stability & Performance**: Python 3.11 introduced substantial performance improvements (Specializing Adaptive Interpreter) while maintaining rock-solid stability and compatibility with standard ML wheels (PyTorch, PEFT, Hugging Face).
2. **Deterministic Stdlib**: The core pipeline relies strictly on Python's standard library (`sqlite3`, `hashlib`, `json`, `urllib`, `pathlib`), allowing zero third-party runtime dependencies in core mode.
3. **Reproducibility**: Bundling a known interpreter version avoids subtle discrepancies across varying minor versions installed on users' systems.

## Interpreter Resolution Order

The Electron shell locates Python using the following deterministic priority chain (`app/lib/python.js`):

1. **Manual Override (`SLM_PYTHON`)**: If set, the app strictly uses the specified executable.
2. **Bundled Distribution**:
   - Windows: `<resourcesPath>/python/python.exe`
   - macOS / Linux: `<resourcesPath>/python/bin/python3`
3. **System Fallbacks**:
   - Windows: `py`, `python`, `python3` (via PATH / Windows Python Launcher)
   - macOS / Linux: `python3`, `python` (via PATH)

If an interpreter is found, the app verifies compatibility by running `slmstudio version`. If all candidates fail or return invalid JSON, a helpful error guides the user.
