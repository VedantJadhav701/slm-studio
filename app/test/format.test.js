'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes, formatGb, formatCount, GOALS } = require('../renderer/format');

test('formatBytes picks a readable unit', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(120 * 1024 * 1024), '120 MB');
  assert.equal(formatBytes(3 * 1024 ** 3), '3.0 GB');
});

test('formatBytes handles bad input', () => {
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatBytes(NaN), '—');
});

test('formatGb reports missing values as not detected', () => {
  assert.equal(formatGb(null), 'Not detected');
  assert.equal(formatGb(undefined), 'Not detected');
  assert.equal(formatGb(16), '16 GB');
});

test('formatCount uses separators and tolerates bad input', () => {
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(undefined), '0');
});

test('every goal has copy for all fields', () => {
  for (const id of ['qa', 'triage', 'command']) {
    for (const key of ['title', 'subtitle', 'needs', 'path']) {
      assert.ok(GOALS[id][key] && GOALS[id][key].length > 10, `${id}.${key} missing`);
    }
  }
});
