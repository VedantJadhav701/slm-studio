'use strict';

// Runs the Python core as a child process and parses its single-JSON-line output.
// No shell is used: arguments are passed as an array, so file names cannot inject commands.

const path = require('node:path');
const { execFile } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 120_000;

function candidatesFor(platform, override, bundledDir) {
  if (override) return [override];
  const bundled = [];
  if (bundledDir) {
    if (platform === 'win32') {
      bundled.push(path.join(bundledDir, 'python.exe'));
    } else {
      bundled.push(path.join(bundledDir, 'bin', 'python3'));
      bundled.push(path.join(bundledDir, 'bin', 'python'));
      bundled.push(path.join(bundledDir, 'python3'));
    }
  }
  const system = platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  return [...bundled, ...system];
}

// Returns the first interpreter that runs `slmstudio version` successfully.
// Checks override first, then bundled distribution, then user-installed interpreters.
function resolvePython({ coreDir, platform = process.platform, override = process.env.SLM_PYTHON, bundledDir, exec = execFile } = {}) {
  const resolvedBundledDir = bundledDir !== undefined
    ? bundledDir
    : (typeof process !== 'undefined' && process.resourcesPath ? path.join(process.resourcesPath, 'python') : null);
  const tried = [];
  const attempt = (candidates) =>
    new Promise((resolve, reject) => {
      if (candidates.length === 0) {
        const err = new Error(
          'Python 3.10 or newer was not found. Install Python, or set SLM_PYTHON to its path.'
        );
        err.tried = tried;
        return reject(err);
      }
      const [cmd, ...rest] = candidates;
      tried.push(cmd);
      exec(cmd, [...(cmd === 'py' ? ['-3'] : []), '-m', 'slmstudio', 'version'],
        { cwd: coreDir, env: coreEnv(coreDir), timeout: 15_000, windowsHide: true },
        (err, stdout) => {
          if (!err && stdout && /"ok":\s*true/.test(stdout)) return resolve(cmd === 'py' ? ['py', '-3'] : [cmd]);
          attempt(rest).then(resolve, reject);
        });
    });
  return attempt(candidatesFor(platform, override, resolvedBundledDir));
}

function coreEnv(coreDir) {
  return {
    ...process.env,
    PYTHONPATH: coreDir,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };
}

function parseOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) throw new Error('the core returned no output');
  try {
    return JSON.parse(last);
  } catch {
    throw new Error('the core returned output that could not be read');
  }
}

// interpreter: array from resolvePython, e.g. ['python3'] or ['py', '-3']
function runCli({ interpreter, coreDir, args, timeoutMs = DEFAULT_TIMEOUT_MS, exec = execFile }) {
  if (!Array.isArray(interpreter) || interpreter.length === 0) {
    return Promise.reject(new Error('Python is not configured'));
  }
  const [cmd, ...pre] = interpreter;
  return new Promise((resolve, reject) => {
    exec(cmd, [...pre, '-m', 'slmstudio', ...args],
      { cwd: coreDir, env: coreEnv(coreDir), timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        let payload;
        try {
          payload = parseOutput(stdout);
        } catch (parseErr) {
          if (err && err.killed) return reject(new Error('The operation took too long and was stopped.'));
          return reject(new Error(parseErr.message + (stderr ? ` (${String(stderr).slice(0, 200)})` : '')));
        }
        if (!payload.ok) return resolve({ ok: false, error: payload.error || 'The operation failed.' });
        return resolve(payload);
      });
  });
}

module.exports = { resolvePython, runCli, parseOutput, candidatesFor, coreEnv };
