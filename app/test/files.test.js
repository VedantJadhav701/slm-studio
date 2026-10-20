'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateSelection } = require('../lib/files');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slm-files-'));
}

test('accepts supported, non-empty files and reports their size', () => {
  const d = tmpDir();
  const f = path.join(d, 'data.jsonl');
  fs.writeFileSync(f, '{"a":1}\n');
  const r = validateSelection([f]);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].name, 'data.jsonl');
  assert.equal(r.accepted[0].size, 8);
  assert.equal(r.rejected.length, 0);
});

test('rejects unsupported extensions with a readable reason', () => {
  const d = tmpDir();
  const f = path.join(d, 'scan.pdf');
  fs.writeFileSync(f, '%PDF');
  const r = validateSelection([f]);
  assert.equal(r.accepted.length, 0);
  assert.match(r.rejected[0].reason, /'\.pdf' is not supported/);
});

test('rejects empty files', () => {
  const d = tmpDir();
  const f = path.join(d, 'empty.csv');
  fs.writeFileSync(f, '');
  const r = validateSelection([f]);
  assert.match(r.rejected[0].reason, /empty/);
});

test('rejects missing files', () => {
  const r = validateSelection([path.join(tmpDir(), 'missing.json')]);
  assert.match(r.rejected[0].reason, /not found/);
});

test('rejects directories', () => {
  const d = tmpDir();
  const sub = path.join(d, 'folder.json');
  fs.mkdirSync(sub);
  const r = validateSelection([sub]);
  assert.match(r.rejected[0].reason, /not a file/);
});

test('does not add the same file twice, including against existing selections', () => {
  const d = tmpDir();
  const f = path.join(d, 'a.txt');
  fs.writeFileSync(f, 'hello');
  const first = validateSelection([f, f]);
  assert.equal(first.accepted.length, 1);
  assert.equal(first.rejected.length, 1);
  assert.match(first.rejected[0].reason, /Already added/);

  const second = validateSelection([f], { existing: [f] });
  assert.equal(second.accepted.length, 0);
});

test('rejects oversized files using the injected stat function', () => {
  const fake = () => ({ isFile: () => true, size: 600 * 1024 * 1024 });
  const r = validateSelection(['/x/big.csv'], { statImpl: fake });
  assert.match(r.rejected[0].reason, /larger than 512 MB/);
});

test('rejects non-string and empty entries without throwing', () => {
  const r = validateSelection([null, '', 42]);
  assert.equal(r.accepted.length, 0);
  assert.equal(r.rejected.length, 3);
});

test('extension check is case-insensitive', () => {
  const d = tmpDir();
  const f = path.join(d, 'DATA.JSONL');
  fs.writeFileSync(f, '{}');
  assert.equal(validateSelection([f]).accepted.length, 1);
});
