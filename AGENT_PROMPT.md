# Prompt for the coding agent

Copy everything below the line into your coding agent. Attach or point it to `PLAN.md`
and `README.md`.

---

You are continuing the build of **SLM Studio**, a free, open-source, local-first desktop
app for Windows and macOS. It helps non-ML users turn their own data into a small language
model that runs on their own computers, fully on-prem.

Read `PLAN.md` first. It is the source of truth for scope, architecture, support matrix,
and acceptance criteria. Read `README.md` for the current status table. Treat that table as
accurate: do not assume anything marked "Not built" exists.

## What already exists

**Core (`slmstudio/`, Python, no third-party runtime dependencies):**
ingest, validation with line numbers, deduplication, deterministic held-out split, hardware
detection, model recommendation, a JSON-out CLI (`python -m slmstudio`), and the
`pipeline.py` orchestrator. Tests: `python3 -m unittest discover -s tests`. All 32 must pass.

**Desktop app (`app/`, Electron, vanilla JS, no build step):**
- Main process with allow-listed IPC, single-instance lock, locked-down session.
- Preload bridge exposing `window.slm`.
- Lib modules for Python discovery and safe process execution, Ollama status, file
  validation, and settings. Each has tests.
- iOS-style renderer with Goal, Data, Machine, and Settings tabs.
- Tests: `cd app && npm test`. All 44 must pass, including a test that runs the real core.

**Landing page (`landing/`):** static, no external assets, with a CSP. Its claims are
checked by `app/test/landing.test.js`. Any feature marked "Next release" or "Planned" must
stay labelled until it actually ships.

Do not weaken, delete, or skip tests to make a change pass. If a test is wrong, say why in
your summary and fix it deliberately.

## Your task, in this order

Finish each step and its tests before starting the next. Work from `README.md`'s status table.

### 1. Bundle the Python runtime (blocks shipping)
The packaged app currently needs the user to have Python installed. Fix that:
- Windows: ship an embeddable Python distribution inside the installer and use it in place of the system interpreter when present. Keep the user-installed fallback.
- macOS: ship a relocatable CPython build inside the app bundle, verify it with `codesign` after signing.
- Update `resolvePython` (in `app/lib/python.js`) to prefer the bundled interpreter, and add tests for the lookup order.
- Document exactly which Python version is bundled and why.

### 2. Chat and RAG on Ollama (milestone M2)
- Add `slmstudio/rag/`: section-aware chunker keeping document and date metadata, an embedding interface with a deterministic fake for tests and one real local backend, a SQLite store, a retriever, and a prompt builder that cites sources.
- Add `slmstudio/ollama.py` for the local HTTP API, with a configurable base URL and a clear "Ollama is not running" error. Tests must run without Ollama, using a fake server.
- In the app, add a Chat screen that streams answers and lists sources under each reply. Put the Node side in `app/lib/chat.js` so it can be tested without a window.
- Add an evaluation runner that scores base versus base-with-RAG on `eval.jsonl` and stores results in the project folder.

### 3. LoRA SFT (milestone M3)
- Add a training sidecar in `slmstudio/train/` behind an optional extra (`pip install .[train]`). The core must still import and pass its tests without it.
- Support one base model and one platform first, as PLAN.md section 5 says. Mark the rest "not supported" in the UI with the reason.
- Progress goes to a JSON-lines log that the app tails. Training must be cancellable, and a crash must leave the project in a clear state.
- Validate the training data again before training starts and refuse to train on an empty or eval-overlapping set.

### 4. Export and comparison (milestone M4)
- Merge or keep the adapter, convert to GGUF, quantise, and register with Ollama. Each step reports its command and exit code.
- Add a base versus fine-tuned comparison view using the held-out set. Never show a fine-tuned score without the base score beside it.

### 5. Release engineering
- Add application icons for both platforms.
- Wire `electron-builder` with signing hooks. Leave secrets out of the repository; read them from the environment.
- Add a GitHub Actions workflow that runs both test suites on Windows and macOS, and builds installers on tags.

## Rules for every step

- Keep the renderer free of Node access. All privileged work goes through the main process, behind an allow-listed channel.
- Never build HTML from user data or file names. Use `textContent` or DOM APIs.
- Never pass user input to a shell. Use argument arrays.
- Respect the privacy rules in `PLAN.md` section 9. No telemetry. No network calls except the ones the user triggers, and the Ollama address they set.
- Do not invent benchmark numbers, model licences, or platform support claims. Mark anything unverified as unverified in the code and the catalog.
- Update `README.md`'s status table when you finish a step, and update the landing page's labels to match.

## What to deliver at the end

- The exact commands you ran and their results for both test suites.
- A list of what changed in each step, and what is still not built.
- The top three risks you noticed, especially anything that would affect users' data or machines.
- Anything you could not test in your environment (for example, the Electron window on macOS, or GPU training), stated plainly.

Keep changes small and reviewable. If the repository is under git, commit after each step
with a message that names the step.
