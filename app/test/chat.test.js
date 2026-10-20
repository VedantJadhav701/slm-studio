'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { streamChat, indexDocuments, queryRag } = require('../lib/chat');

function createMockOllamaServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          if (payload.model === 'error-model') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal failure' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ message: { role: 'assistant', content: 'Antigravity ' } }) + '\n');
          res.write(JSON.stringify({ message: { role: 'assistant', content: 'Local ' } }) + '\n');
          res.write(JSON.stringify({ message: { role: 'assistant', content: 'SLM.' }, done: true }) + '\n');
          res.end();
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('streamChat streams tokens from server and finishes with onDone', async () => {
  const { server, url } = await createMockOllamaServer();
  try {
    const tokens = [];
    await new Promise((resolve, reject) => {
      streamChat({
        ollamaUrl: url,
        model: 'llama3.2:1b',
        messages: [{ role: 'user', content: 'hi' }],
        onToken: (tok) => tokens.push(tok),
        onDone: (res) => {
          if (res && res.done) resolve();
        },
        onError: reject,
      });
    });
    assert.deepEqual(tokens, ['Antigravity ', 'Local ', 'SLM.']);
  } finally {
    server.close();
  }
});

test('streamChat handles HTTP error from server cleanly', async () => {
  const { server, url } = await createMockOllamaServer();
  try {
    await new Promise((resolve) => {
      streamChat({
        ollamaUrl: url,
        model: 'error-model',
        messages: [{ role: 'user', content: 'trigger error' }],
        onToken: () => {},
        onDone: () => {},
        onError: (err) => {
          assert.match(err.message, /HTTP 500/);
          resolve();
        },
      });
    });
  } finally {
    server.close();
  }
});

test('streamChat handles unreachable server with actionable message', async () => {
  await new Promise((resolve) => {
    streamChat({
      ollamaUrl: 'http://127.0.0.1:59998',
      model: 'llama3.2:1b',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: () => {},
      onDone: () => {},
      onError: (err) => {
        assert.match(err.message, /Cannot connect to Ollama/);
        resolve();
      },
    });
  });
});

test('indexDocuments and queryRag invoke runCli with safe arguments', async () => {
  let seen = null;
  const mockExec = (cmd, args, opts, cb) => {
    seen = { cmd, args, shell: opts.shell };
    cb(null, '{"ok": true, "retrieved_count": 1, "citations": []}\n', '');
  };

  const res = await queryRag({
    interpreter: ['py', '-3'],
    coreDir: '.',
    dbPath: 'test.db',
    query: 'What is our refund policy?',
    topK: 2,
    embedder: 'fake',
    exec: mockExec,
  });

  assert.equal(res.ok, true);
  assert.equal(seen.cmd, 'py');
  assert.deepEqual(seen.args.slice(0, 3), ['-3', '-m', 'slmstudio']);
  assert.ok(seen.args.includes('rag-query'));
  assert.ok(seen.args.includes('What is our refund policy?'));
  assert.notEqual(seen.shell, true);
});
