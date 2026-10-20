'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const settings = require('../lib/settings');

const PROJECTS = '/home/user/Documents/SLM Studio';

test('defaults are applied when nothing is stored', () => {
  const s = settings.sanitise({}, PROJECTS);
  assert.equal(s.goal, 'qa');
  assert.equal(s.ollamaUrl, 'http://127.0.0.1:11434');
  assert.equal(s.evalFraction, 0.1);
  assert.equal(s.projectsDir, PROJECTS);
});

test('unknown goals fall back to the default', () => {
  assert.equal(settings.sanitise({ goal: 'hack' }, PROJECTS).goal, 'qa');
});

test('evaluation share is clamped to the allowed range', () => {
  assert.equal(settings.sanitise({ evalFraction: 0.9 }, PROJECTS).evalFraction, 0.5);
  assert.equal(settings.sanitise({ evalFraction: 0 }, PROJECTS).evalFraction, 0.02);
  assert.equal(settings.sanitise({ evalFraction: 'abc' }, PROJECTS).evalFraction, 0.1);
});

test('an invalid Ollama address is replaced with the default', () => {
  assert.equal(settings.sanitise({ ollamaUrl: 'javascript:alert(1)' }, PROJECTS).ollamaUrl, 'http://127.0.0.1:11434');
});

test('save then load round-trips and leaves no temp file behind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slm-settings-'));
  const file = path.join(dir, 'nested', 'settings.json');
  settings.save(file, { goal: 'triage', evalFraction: 0.25, ollamaUrl: 'http://10.0.0.5:11434' }, PROJECTS);
  const loaded = settings.load(file, PROJECTS);
  assert.equal(loaded.goal, 'triage');
  assert.equal(loaded.evalFraction, 0.25);
  assert.equal(loaded.ollamaUrl, 'http://10.0.0.5:11434');
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('a corrupted settings file does not crash; defaults are used', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slm-settings-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{not json');
  const loaded = settings.load(file, PROJECTS);
  assert.equal(loaded.goal, 'qa');
});

test('a missing settings file yields defaults', () => {
  const loaded = settings.load(path.join(os.tmpdir(), 'does-not-exist-slm.json'), PROJECTS);
  assert.equal(loaded.evalFraction, 0.1);
});
