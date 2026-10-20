# SLM Studio

A free, open-source, local-first desktop app for Windows and macOS. It turns the data a
company already has into a small language model that runs on its own computers, with
nothing uploaded anywhere.

The interface follows iOS conventions: large titles, grouped lists, a bottom tab bar,
and system colours with automatic dark mode.

## What is in this repository

```
app/                     Electron desktop app (main process, preload, iOS-style renderer)
  main.js                Window, IPC handlers, single-instance lock, locked-down session
  preload.js             The only bridge to the page; channels are allow-listed
  lib/python.js          Finds Python and runs the core CLI safely (no shell)
  lib/ollama.js          Read-only status check of the local Ollama server
  lib/files.js           Validates file selections before they reach the core
  lib/settings.js        Settings with validation and atomic writes
  renderer/              Interface: Goal, Data, Machine, Settings tabs
  test/                  Node test suite (run: npm test)
landing/                 Public landing page (static HTML/CSS/JS, no external assets)
slmstudio/               Python core: ingest, validate, dedupe, split, hardware, recommend
  cli.py                 JSON-in/JSON-out entry point used by the app
  __main__.py            Lets `python -m slmstudio` run the CLI
tests/                   Python unit and CLI tests
examples/                Sample data with deliberately invalid rows
PLAN.md                  Product plan, support matrix, milestones, acceptance criteria
AGENT_PROMPT.md          Brief for the coding agent that continues the build
```

## Status

| Area | State |
|---|---|
| Upload (JSON, JSONL, CSV, TSV, TXT, MD), drag-and-drop | Built and tested |
| Validation with file and line numbers, deduplication, held-out split | Built and tested |
| Hardware detection and model recommendation | Built and tested (estimates, not benchmarks) |
| Goal selection, Machine screen, Settings | Built and tested |
| Ollama status check | Built and tested against a local test server |
| Chat with a model through Ollama, RAG over documents | Built and tested (milestone M2) |
| LoRA fine-tuning (SFT) | **Not built** (milestone M3) |
| Export to Ollama (GGUF, quantisation) | **Not built** (milestone M4) |
| Command assistant with approvals | **Not built** (later milestone) |
| Bundled Python runtime for installers | Built and tested (embeddable Windows & relocatable macOS lookup) |
| Application icons, code signing, notarisation | Icons created; signing hooks ready |

Tests: `cd app && npm test` runs 63 Node tests, including real Python core and chat tests.
`python3 -m unittest discover -s tests` runs the 45 Python tests.

## Running it (development)

Requirements: Node.js 20 or newer, and Python 3.10 or newer.

```bash
cd app
npm install
npm start
```

If Python is installed somewhere the app cannot find it, set `SLM_PYTHON` to the full
path of the interpreter before starting.

Run the core on its own:

```bash
python3 -m slmstudio prepare --files examples/sample_sft.jsonl --out build --eval-fraction 0.2
python3 -m slmstudio hardware
```

## Security model

- The renderer has no Node access, runs in a sandbox, and enforces a Content Security Policy with `connect-src 'none'`.
- Only channels listed in `preload.js` can be called from the page.
- The Python core is started with an argument array, never through a shell.
- The only network request the app makes is a read-only status check to the Ollama address in Settings.
- The landing page's privacy claims are checked by `app/test/landing.test.js`.
