# Contributing to SLM Studio

Thank you for your interest in contributing to SLM Studio! We welcome community contributions to build a free, open-source, local-first platform for domain language models.

## Architecture Overview

SLM Studio is organized into two primary layers:

1. **Python Core (`slmstudio/`)**:
   - Zero runtime third-party dependencies.
   - Handles ingestion, line-accurate validation, deduplication, deterministic splitting, hardware profiling, RAG indexing, retrieval, and evaluation.
   - Entry point: `python -m slmstudio <command>`. Prints exactly one line of JSON to stdout.
   - Tests: `python -m unittest discover -s tests`.

2. **Desktop Shell (`app/`)**:
   - Electron application with strict security isolation.
   - Renderer has `contextIsolation: true`, `nodeIntegration: false`, and CSP `connect-src 'none'`.
   - Privileged operations occur exclusively in the main process behind allowlisted IPC channels (`preload.js`).
   - Tests: `cd app && npm test` (utilizes Node.js native test runner `node --test`).

3. **Landing Page (`landing/`)**:
   - Zero-external asset static showcase with strict CSP.
   - Claims verified by automated tests in `app/test/landing.test.js`.

## Non-Negotiable Development Rules

- **Privacy & Local-First**: Zero telemetry. No network requests except local Ollama calls configured by the user.
- **Dependency Minimalist**: Keep the Python core free of third-party runtime dependencies.
- **Security**: Never construct HTML strings from user input. Always use DOM APIs (`textContent`, `createElement`).
- **Safety**: Never execute system commands through a shell. Pass argument arrays (`execFile`).
- **Tests First**: Never weaken, disable, or delete a test to make code pass. Both test suites must pass on all platforms.

## Development Setup

Requirements:
- Node.js 20 or newer
- Python 3.10 or newer
- Git

```bash
# Clone the repository
git clone https://github.com/VedantJadhav701/slm-studio.git
cd slm-studio

# Run Python tests
python -m unittest discover -s tests

# Run Node tests
cd app
npm test

# Launch desktop app in development
npm start
```

## Pull Request Guidelines

1. Create a feature branch (`git checkout -b feature/my-feature`).
2. Keep commits atomic and informative following conventional commits (`feat:`, `fix:`, `test:`, `docs:`).
3. Ensure all Python (`python -m unittest discover -s tests`) and Node (`npm test`) tests pass.
4. Update `README.md` and documentation if introducing new capabilities.
5. Open a Pull Request against `main`.
