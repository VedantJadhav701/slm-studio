# SLM Studio — Product Plan

## 1. Goal

A free, open-source, local-first desktop app for Windows and macOS. A non-ML user (a
company engineer or domain expert) can:

1. Upload their own data (JSON, JSONL first; CSV, TXT, MD next).
2. Pick a goal (knowledge Q&A, ticket triage, command/automation assistant).
3. See what their machine can run and which models suit the goal.
4. Optionally train a small model with LoRA (SFT), or continue pretraining (CPT) when the data volume justifies it.
5. Evaluate the result against a held-out set and compare it with the base model.
6. Run the final model on-prem through Ollama, on CPU or GPU, with no data leaving the machine.

## 2. Non-goals for v1

- Full fine-tuning (shown as "not available on this hardware" or deferred).
- Arbitrary file formats beyond the list above. PDF, DOCX, and scanned documents come in v1.1.
- Agent actions that change external systems. v1 agents are suggest-only.
- Multi-user servers, auth, and fleet management.
- Any cloud training path.

## 3. Architecture

| Layer | Technology | Role |
|---|---|---|
| Desktop shell | Electron + Next.js (reuse Open Dot Local stack) | UI, file handling, process supervision |
| Core pipeline | Python package `slmstudio/` (this repo) | ingest, validate, dedupe, split, hardware, recommend |
| Training sidecar | Python: PyTorch + PEFT/TRL (Windows/NVIDIA), MLX (Apple Silicon) | LoRA SFT, CPT; launched and monitored by Electron |
| Inference | Ollama | serve base and fine-tuned models; chat and eval |
| RAG store | SQLite + local embedding model | retrieval for knowledge Q&A |
| Export | GGUF conversion + quantisation, then `ollama create` | make trained models runnable in Ollama |

Ollama is used for inference only. It can load adapters and GGUF models but cannot train.

Electron talks to the Python core over a local JSON-over-stdio protocol. Every long job
(training, evaluation, export) writes progress events to a log file, so the UI can resume
after a restart.

## 4. Pipeline stages

1. **Ingest** — load files, keep line numbers for every row.
2. **Validate** — accept chat (`messages`), instruction/output, question/answer, or text (CPT). Report every bad row with file and line.
3. **Deduplicate** — exact and normalised-text duplicates removed; reported with pointers.
4. **Split** — deterministic hash-based train/eval split; eval never overlaps train.
5. **Recommend** — hardware profile and memory estimate, mapped to a short model catalog.
6. **Train** (v1 MVP: LoRA SFT only) — run the sidecar with the chosen base model and hyperparameters.
7. **Evaluate** — score base vs fine-tuned on the held-out set (exact match, rubric score, and optional LLM-as-judge run locally). Show results side by side.
8. **Export** — merge or keep the adapter, convert to GGUF, quantise, register with Ollama.
9. **Use** — chat, and optional agent mode with allowlisted tools and approval prompts.

## 5. Support matrix

| Capability | Windows | macOS |
|---|---|---|
| Ingest, validate, dedupe, split | Yes | Yes |
| Inference via Ollama, CPU | Yes | Yes |
| Inference via Ollama, GPU | NVIDIA (CUDA) | Apple Silicon (Metal) |
| LoRA SFT | NVIDIA GPU, 8 GB+ VRAM for 0.6B–1.7B | Apple Silicon 16 GB+ unified memory (MLX) |
| LoRA SFT on CPU | Tiny models only, with a time warning | Tiny models only, with a time warning |
| CPT | Off in MVP | Off in MVP |
| Full fine-tuning | Off | Off |
| AMD GPU training | Best-effort, documented as unsupported in v1 | n/a |

Anything marked "best-effort" or "off" shows a clear reason in the UI. It is never silently broken.

## 6. Model catalog policy

- Keep 4–6 models per tier, benchmarked by us on the same eval set. No live "best model" ranking, because it goes stale.
- Each catalog entry lists: base model, licence, size, memory estimate, eval score, and last-verified date.
- Only base models with licences that allow commercial on-prem use are listed. Check each licence before listing.

## 7. Evaluation rules (non-negotiable)

- The app never claims a model is good without showing eval numbers from the held-out set.
- The eval set is created before training and is never edited after training starts.
- Show base model and fine-tuned model on the same eval set, with the same prompt template.
- If fine-tuning does not beat the base model with RAG, the UI says so.

## 8. Agent layer (v1 scope: suggest-only)

- Tools are typed and narrow, for example `create_ticket(category, priority, summary)`.
- Output is constrained to valid tool-call JSON (grammar or schema decoding).
- No arbitrary shell. Commands are mapped from allowlisted templates.
- Any action that changes state needs explicit user approval.
- Every prompt, retrieved context, tool call, and result is written to an audit log.

## 9. Privacy and security

- All data, weights, indexes, and logs stay on the user's machine. No telemetry by default; any telemetry is opt-in and contains no data content.
- No network calls except model downloads, which the user triggers and which are logged.
- Secrets (if any) use DPAPI on Windows and Keychain on macOS.
- Signed and notarised installers for both platforms.

## 10. MVP milestones

| Milestone | Deliverable | Done when |
|---|---|---|
| M0 | Core pipeline (this repo) | Tests pass; sample runs end to end; reports are correct |
| M1 | Electron shell: upload, goal selection, hardware screen | User can upload a file, see validation issues, and see a model recommendation |
| M2 | RAG chat on Ollama | Answers cite retrieved chunks; eval set scores are shown |
| M3 | LoRA SFT sidecar on one supported platform | Training completes on the reference machine; logs and progress visible |
| M4 | Eval comparison and export to Ollama | Base vs fine-tuned table; fine-tuned model runs in Ollama |
| M5 | Packaging, signing, docs | Installers for Windows and macOS; quick-start guide |
| v1.1 | PDF/DOCX ingest, CPT, agent actions with approvals | Each feature has its own acceptance tests |

## 11. Acceptance criteria for M0 (this repo)

- Unit tests cover ingest, validation, dedupe, split, hardware fallbacks, and recommendation.
- Bad rows are reported with file and line number; good rows are never silently dropped.
- Splits are deterministic and never overlap.
- The CLI writes `train.jsonl`, `eval.jsonl`, optional `cpt.jsonl`, and `report.json`.
- No third-party runtime dependencies for the core.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Users upload poor data and blame the tool | Validation and dedupe reports are the first screen after upload |
| Fine-tuning does not beat RAG | Show base, RAG, and fine-tuned results side by side; recommend RAG when it wins |
| Training is too slow or fails on user hardware | Hardware check before training; clear "not supported here" messages |
| GPU driver matrix explodes | Limit the supported matrix (section 5); mark everything else best-effort |
| Competition (LM Studio, Ollama, Unsloth) | Differentiate on guided workflow and built-in evaluation |
| Model licences change | Catalog entries are re-verified on each release |
