# Architecture Whitepaper

SLM Studio is an on-premise, local-first platform engineered to empower domain teams and non-ML engineers to prepare corporate data, evaluate models, run RAG pipelines, and fine-tune small language models without sending proprietary data to external cloud providers.

## System Topology

```
┌────────────────────────────────────────────────────────┐
│               Electron Desktop Shell                   │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │   Sandboxed Renderer  │   │  Main Node Process   │  │
│  │  (CSP connect-src:none│<─>│ (Allowlisted IPC,    │  │
│  │   DOM APIs only)      │   │  Process Supervisor) │  │
│  └───────────────────────┘   └──────────┬───────────┘  │
└─────────────────────────────────────────┼──────────────┘
                                          │ stdio / array args
                               ┌──────────▼──────────┐
                               │  Local Python Core  │
                               │  (slmstudio stdlib) │
                               └────┬───────────┬────┘
                     vector query   │           │ training job
               ┌────────────────────┘           └────────────────────┐
               ▼                                                     ▼
     ┌───────────────────┐                                 ┌───────────────────┐
     │ SQLite RAG Store  │                                 │ LoRA SFT Sidecar  │
     │ (chunks, vectors) │                                 │ (PEFT / PyTorch)  │
     └───────────────────┘                                 └───────────────────┘
```

## Security & Privacy Non-Negotiables

1. **Zero External Telemetry**: No tracking beacons, crash telemetry, or phone-home requests exist in the codebase.
2. **Strict Context Isolation**: Renderer executes in a sandbox with `nodeIntegration: false`, `contextIsolation: true`, and `connect-src 'none'`.
3. **Array Arguments Only**: Every child process invocation passes parameters as strict string arrays (`execFile`), eliminating command injection.
4. **Deterministic Held-Out Sets**: Evaluation splits are computed using deterministic hashing before training begins, ensuring zero contamination.
