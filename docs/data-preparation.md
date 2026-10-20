# Data Preparation Guide

High-quality domain models require representative, properly structured training data. SLM Studio supports five common text and conversational formats.

## Supported Formats

### 1. JSON Lines (`.jsonl`)
Standard multi-turn or single-turn conversations.
```json
{"messages": [{"role": "user", "content": "What is our leave policy?"}, {"role": "assistant", "content": "Employees receive 25 days of paid annual leave."}]}
```

### 2. CSV / TSV (`.csv`, `.tsv`)
Spreadsheet rows with column headers matching either `messages` or `question` + `answer`.
```csv
question,answer,category
"How do I setup VPN?","Install WireGuard from self-service portal.","IT"
```

### 3. Markdown / Plain Text (`.md`, `.txt`)
Section-structured documentation or continuous pretraining corpora. Headers (`#`, `##`) are used by the chunker to preserve topic boundaries and citation anchors.

## Deduplication & Splitting

1. **Exact Deduplication**: Identical normalized string content hashes are consolidated.
2. **Near Deduplication**: Minor whitespace and punctuation variations are detected and flagged.
3. **Deterministic Splitting**: Records are split into `train.jsonl` and `eval.jsonl` using deterministic SHA-256 modulo math, guaranteeing that the evaluation set never leaks into the training set.
