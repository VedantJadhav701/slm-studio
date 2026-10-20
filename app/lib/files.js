'use strict';

// Checks user-selected paths before they reach the Python core.
// Mirrors the limits in slmstudio/cli.py so errors appear early, with a clear reason.

const fs = require('node:fs');
const path = require('node:path');

const ALLOWED = new Set(['.jsonl', '.json', '.csv', '.tsv', '.txt', '.md']);
const MAX_BYTES = 512 * 1024 * 1024;

function validateSelection(paths, { statImpl = fs.statSync, existing = [] } = {}) {
  const accepted = [];
  const rejected = [];
  const seen = new Set(existing.map((p) => path.resolve(p)));

  for (const raw of paths || []) {
    if (typeof raw !== 'string' || raw.length === 0) {
      rejected.push({ path: String(raw), reason: 'Not a valid file path.' });
      continue;
    }
    const resolved = path.resolve(raw);
    const name = path.basename(resolved);
    if (seen.has(resolved)) {
      rejected.push({ path: resolved, reason: 'Already added.' });
      continue;
    }
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED.has(ext)) {
      rejected.push({ path: resolved, reason: `${name}: '${ext || 'no extension'}' is not supported yet.` });
      continue;
    }
    let st;
    try {
      st = statImpl(resolved);
    } catch {
      rejected.push({ path: resolved, reason: `${name}: file not found.` });
      continue;
    }
    if (!st.isFile()) {
      rejected.push({ path: resolved, reason: `${name}: not a file.` });
      continue;
    }
    if (st.size === 0) {
      rejected.push({ path: resolved, reason: `${name}: the file is empty.` });
      continue;
    }
    if (st.size > MAX_BYTES) {
      rejected.push({ path: resolved, reason: `${name}: larger than 512 MB. Split it first.` });
      continue;
    }
    seen.add(resolved);
    accepted.push({ path: resolved, name, size: st.size });
  }
  return { accepted, rejected };
}

module.exports = { validateSelection, ALLOWED_EXTENSIONS: [...ALLOWED], MAX_BYTES };
