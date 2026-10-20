'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { candidatesFor, parseOutput, resolvePython, runCli } = require('../lib/python');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE = path.join(REPO_ROOT, 'examples', 'sample_sft.jsonl');

test('candidate interpreters differ by platform', () => {
  assert.deepEqual(candidatesFor('linux'), ['python3', 'python']);
  assert.deepEqual(candidatesFor('darwin'), ['python3', 'python']);
  assert.deepEqual(candidatesFor('win32'), ['py', 'python', 'python3']);
  assert.deepEqual(candidatesFor('linux', '/opt/py/bin/python'), ['/opt/py/bin/python']);
});

test('bundled interpreter is prioritized over system interpreters when present', () => {
  const winBundled = candidatesFor('win32', null, 'C:\\bundled');
  assert.equal(winBundled[0], path.join('C:\\bundled', 'python.exe'));
  assert.deepEqual(winBundled.slice(1), ['py', 'python', 'python3']);

  const macBundled = candidatesFor('darwin', null, '/bundled');
  assert.equal(macBundled[0], path.join('/bundled', 'bin', 'python3'));
  assert.equal(macBundled[1], path.join('/bundled', 'bin', 'python'));
  assert.equal(macBundled[2], path.join('/bundled', 'python3'));
  assert.deepEqual(macBundled.slice(3), ['python3', 'python']);

  // override still has top priority over bundled
  assert.deepEqual(candidatesFor('win32', 'C:\\custom\\py.exe', 'C:\\bundled'), ['C:\\custom\\py.exe']);
});

test('resolvePython prefers bundled interpreter when available', async () => {
  const calls = [];
  const exec = (cmd, args, opts, cb) => {
    calls.push(cmd);
    if (cmd === path.join('/bundled', 'bin', 'python3')) cb(null, '{"ok": true}\n', '');
    else cb(new Error('not used'), '', '');
  };
  const interp = await resolvePython({
    coreDir: REPO_ROOT,
    platform: 'darwin',
    bundledDir: '/bundled',
    override: null,
    exec,
  });
  assert.deepEqual(interp, [path.join('/bundled', 'bin', 'python3')]);
  assert.equal(calls[0], path.join('/bundled', 'bin', 'python3'));
});

test('resolvePython falls back to system interpreter if bundled interpreter fails', async () => {
  const calls = [];
  const exec = (cmd, args, opts, cb) => {
    calls.push(cmd);
    if (cmd === 'python3') cb(null, '{"ok": true}\n', '');
    else cb(new Error('missing'), '', '');
  };
  const interp = await resolvePython({
    coreDir: REPO_ROOT,
    platform: 'darwin',
    bundledDir: '/bundled',
    override: null,
    exec,
  });
  assert.deepEqual(interp, ['python3']);
  assert.ok(calls.includes(path.join('/bundled', 'bin', 'python3')));
  assert.ok(calls.includes('python3'));
});

test('parseOutput takes the last JSON line and ignores stray log lines', () => {
  const out = 'warning: something\n{"ok": true, "version": "0.1.0"}\n';
  assert.deepEqual(parseOutput(out), { ok: true, version: '0.1.0' });
});

test('parseOutput rejects empty or non-JSON output', () => {
  assert.throws(() => parseOutput(''), /no output/);
  assert.throws(() => parseOutput('Traceback (most recent call last)'), /could not be read/);
});

test('resolvePython returns the first interpreter that answers', async () => {
  const exec = (cmd, args, opts, cb) => {
    if (cmd === 'python3') cb(null, '{"ok": true}\n', '');
    else cb(new Error('not found'), '', '');
  };
  const interp = await resolvePython({ coreDir: REPO_ROOT, platform: 'linux', exec });
  assert.deepEqual(interp, ['python3']);
});

test('resolvePython explains what to do when no interpreter works', async () => {
  const exec = (_cmd, _args, _opts, cb) => cb(new Error('missing'), '', '');
  await assert.rejects(
    () => resolvePython({ coreDir: REPO_ROOT, platform: 'linux', exec }),
    (err) => /SLM_PYTHON/.test(err.message) && err.tried.length === 2,
  );
});

test('runCli surfaces a handled error from the core as ok:false', async () => {
  const exec = (_cmd, _args, _opts, cb) => cb(new Error('exit 1'), '{"ok": false, "error": "file not found: x"}\n', '');
  const r = await runCli({ interpreter: ['python3'], coreDir: REPO_ROOT, args: ['prepare'], exec });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'file not found: x');
});

test('runCli passes arguments as an array, never through a shell', async () => {
  let seen;
  const exec = (cmd, args, opts, cb) => { seen = { cmd, args, shell: opts.shell }; cb(null, '{"ok": true}', ''); };
  await runCli({ interpreter: ['py', '-3'], coreDir: REPO_ROOT, args: ['prepare', '--files', 'a; rm -rf /'], exec });
  assert.equal(seen.cmd, 'py');
  assert.deepEqual(seen.args.slice(0, 3), ['-3', '-m', 'slmstudio']);
  assert.ok(seen.args.includes('a; rm -rf /'));
  assert.notEqual(seen.shell, true);
});

test('runCli rejects when Python is not configured', async () => {
  await assert.rejects(() => runCli({ interpreter: null, coreDir: REPO_ROOT, args: ['version'] }), /not configured/);
});

// Integration: runs the real Python core. Skipped automatically if Python is not installed.
test('integration: real core answers version and prepare', async (t) => {
  let interpreter;
  try {
    interpreter = await resolvePython({ coreDir: REPO_ROOT });
  } catch {
    t.skip('Python 3.10+ is not available in this environment');
    return;
  }
  const version = await runCli({ interpreter, coreDir: REPO_ROOT, args: ['version'] });
  assert.equal(version.ok, true);

  const outDir = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'slm-int-'));
  const prep = await runCli({
    interpreter,
    coreDir: REPO_ROOT,
    args: ['prepare', '--files', SAMPLE, '--out', outDir, '--eval-fraction', '0.2'],
  });
  assert.equal(prep.ok, true);
  assert.equal(prep.report.rows_invalid, 2);
  assert.ok(prep.report.train_size + prep.report.eval_size > 0);
});
