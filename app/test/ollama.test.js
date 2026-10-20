'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { getStatus, normaliseBaseUrl, DEFAULT_URL } = require('../lib/ollama');

test('normaliseBaseUrl defaults to the local Ollama address', () => {
  assert.equal(normaliseBaseUrl(''), DEFAULT_URL);
  assert.equal(normaliseBaseUrl('   '), DEFAULT_URL);
});

test('normaliseBaseUrl keeps only the origin', () => {
  assert.equal(normaliseBaseUrl('http://10.0.0.5:11434/some/path?x=1'), 'http://10.0.0.5:11434');
});

test('normaliseBaseUrl rejects other schemes and embedded credentials', () => {
  assert.throws(() => normaliseBaseUrl('file:///etc/passwd'), /http/);
  assert.throws(() => normaliseBaseUrl('ftp://host'), /http/);
  assert.throws(() => normaliseBaseUrl('http://user:pass@host:11434'), /username or password/);
  assert.throws(() => normaliseBaseUrl('not a url'), /full address/);
});

function startFakeOllama(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('getStatus reads installed model names from a running server', async () => {
  const { server, url } = await startFakeOllama((req, res) => {
    assert.equal(req.url, '/api/tags');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'llama3.2:1b' }] }));
  });
  try {
    const status = await getStatus(url);
    assert.equal(status.running, true);
    assert.deepEqual(status.models, ['qwen3:4b', 'llama3.2:1b']);
    assert.equal(status.error, null);
  } finally {
    server.close();
  }
});

test('getStatus reports not running when nothing is listening', async () => {
  const { server, url } = await startFakeOllama((_req, res) => res.end());
  await new Promise((r) => server.close(r));
  const status = await getStatus(url, { timeoutMs: 1000 });
  assert.equal(status.running, false);
  assert.match(status.error, /not running/);
});

test('getStatus handles a non-200 answer', async () => {
  const { server, url } = await startFakeOllama((_req, res) => { res.writeHead(500); res.end(); });
  try {
    const status = await getStatus(url);
    assert.equal(status.running, false);
    assert.match(status.error, /500/);
  } finally {
    server.close();
  }
});

test('getStatus tolerates a malformed body', async () => {
  const { server, url } = await startFakeOllama((_req, res) => { res.end('not json'); });
  try {
    const status = await getStatus(url);
    assert.equal(status.running, false);
  } finally {
    server.close();
  }
});

test('getStatus refuses an invalid address without making a request', async () => {
  let called = false;
  const status = await getStatus('ftp://nope', { fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(status.running, false);
});
