'use strict';

// Chat streaming and RAG coordination for the desktop app.
// Runs purely in the main/Node process with no window dependency.

const http = require('node:http');
const https = require('node:https');
const { runCli } = require('./python');

function streamChat({
  ollamaUrl = 'http://127.0.0.1:11434',
  model = 'llama3.2:1b',
  messages = [],
  onToken,
  onDone,
  onError,
  httpModule, // injectable for testing
}) {
  const urlObj = new URL(ollamaUrl);
  const isHttps = urlObj.protocol === 'https:';
  const client = httpModule || (isHttps ? https : http);

  const payload = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  const options = {
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 60_000,
  };

  const req = client.request(options, (res) => {
    if (res.statusCode && res.statusCode >= 400) {
      let errBody = '';
      res.on('data', (d) => { errBody += d; });
      res.on('end', () => {
        const msg = `Ollama server responded with HTTP ${res.statusCode}: ${errBody || res.statusMessage}`;
        if (onError) onError(new Error(msg));
      });
      return;
    }

    let buffer = '';
    res.setEncoding('utf8');

    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const token = parsed.message?.content || '';
          if (token && onToken) onToken(token);
          if (parsed.done && onDone) onDone(parsed);
        } catch {
          // ignore malformed line
        }
      }
    });

    res.on('end', () => {
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          const token = parsed.message?.content || '';
          if (token && onToken) onToken(token);
          if (parsed.done && onDone) onDone(parsed);
        } catch {
          // ignore
        }
      }
      if (onDone) onDone({ done: true });
    });
  });

  req.on('timeout', () => {
    req.destroy(new Error('Request to Ollama timed out.'));
  });

  req.on('error', (err) => {
    const error = new Error(`Cannot connect to Ollama at ${ollamaUrl}. Ensure Ollama is running.`);
    error.cause = err;
    if (onError) onError(error);
  });

  req.write(payload);
  req.end();

  return () => {
    try {
      req.destroy();
    } catch {
      // ignore
    }
  };
}

async function indexDocuments({ interpreter, coreDir, dbPath, files, embedder = 'fake', ollamaUrl, exec }) {
  const args = ['rag-index', '--files', ...files, '--db', dbPath, '--embedder', embedder];
  if (ollamaUrl) args.push('--ollama-url', ollamaUrl);
  return runCli({ interpreter, coreDir, args, timeoutMs: 300_000, exec });
}

async function queryRag({ interpreter, coreDir, dbPath, query, topK = 3, embedder = 'fake', ollamaUrl, system, exec }) {
  const args = ['rag-query', '--query', query, '--db', dbPath, '--top-k', String(topK), '--embedder', embedder];
  if (ollamaUrl) args.push('--ollama-url', ollamaUrl);
  if (system) args.push('--system', system);
  return runCli({ interpreter, coreDir, args, timeoutMs: 60_000, exec });
}

async function evaluateRag({
  interpreter,
  coreDir,
  dbPath,
  evalFile,
  outDir,
  model = 'llama3.2:1b',
  embedder = 'fake',
  ollamaUrl,
  useOllama = false,
  maxRecords = 50,
  exec,
}) {
  const args = [
    'rag-eval',
    '--eval-file',
    evalFile,
    '--db',
    dbPath,
    '--out',
    outDir,
    '--model',
    model,
    '--embedder',
    embedder,
    '--max-records',
    String(maxRecords),
  ];
  if (ollamaUrl) args.push('--ollama-url', ollamaUrl);
  if (useOllama) args.push('--use-ollama');
  return runCli({ interpreter, coreDir, args, timeoutMs: 300_000, exec });
}

module.exports = {
  streamChat,
  indexDocuments,
  queryRag,
  evaluateRag,
};
