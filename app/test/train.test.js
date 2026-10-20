'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readProgressEvents, getLatestStep, startTraining, cancelTraining } = require('../lib/train');

test('readProgressEvents returns empty array on nonexistent file', () => {
  const events = readProgressEvents('/path/does/not/exist');
  assert.deepEqual(events, []);
});

test('readProgressEvents correctly parses JSON lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slm-train-test-'));
  const logFile = path.join(tmpDir, 'progress.jsonl');

  fs.writeFileSync(
    logFile,
    JSON.stringify({ event: 'init' }) + '\n' +
    JSON.stringify({ event: 'step', step: 1, percent: 10.0, loss: 1.5 }) + '\n' +
    JSON.stringify({ event: 'step', step: 2, percent: 20.0, loss: 1.2 }) + '\n'
  );

  const events = readProgressEvents(tmpDir);
  assert.equal(events.length, 3);
  assert.equal(events[1].step, 1);

  const latest = getLatestStep(tmpDir);
  assert.equal(latest.status, 'training');
  assert.equal(latest.lastStep.step, 2);
  assert.equal(latest.lastStep.loss, 1.2);
});

test('startTraining invokes core CLI with argument array', async () => {
  let seen = null;
  const mockExec = (cmd, args, opts, cb) => {
    seen = { cmd, args, shell: opts.shell };
    cb(null, '{"ok": true, "summary": {"final_loss": 0.4}}\n', '');
  };

  const res = await startTraining({
    interpreter: ['python3'],
    coreDir: '.',
    trainFile: 'train.jsonl',
    evalFile: 'eval.jsonl',
    outDir: 'out',
    model: 'llama3.2:1b',
    epochs: 2,
    dryRun: true,
    exec: mockExec,
  });

  assert.equal(res.ok, true);
  assert.deepEqual(seen.args.slice(0, 3), ['-m', 'slmstudio', 'train']);
  assert.ok(seen.args.includes('--dry-run'));
  assert.notEqual(seen.shell, true);
});

test('cancelTraining generates cancel CLI call', async () => {
  let seen = null;
  const mockExec = (cmd, args, opts, cb) => {
    seen = { cmd, args };
    cb(null, '{"ok": true, "cancellation_requested": true}\n', '');
  };

  const res = await cancelTraining({
    interpreter: ['py', '-3'],
    coreDir: '.',
    jobDir: 'my-job',
    exec: mockExec,
  });

  assert.equal(res.ok, true);
  assert.ok(seen.args.includes('train-cancel'));
  assert.ok(seen.args.includes('my-job'));
});
