'use strict';

// Minimal client for the local Ollama HTTP API. Only reads status; never sends user data.

const DEFAULT_URL = 'http://127.0.0.1:11434';

function normaliseBaseUrl(raw) {
  const value = String(raw || '').trim() || DEFAULT_URL;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a full address such as http://127.0.0.1:11434');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The Ollama address must start with http:// or https://');
  }
  if (url.username || url.password) {
    throw new Error('Do not put a username or password in the Ollama address');
  }
  return url.origin;
}

async function getStatus(baseUrl, { timeoutMs = 3000, fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try {
    origin = normaliseBaseUrl(baseUrl);
  } catch (err) {
    return { running: false, models: [], error: err.message };
  }
  try {
    const res = await fetchImpl(`${origin}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!res.ok) return { running: false, models: [], error: `Ollama answered with status ${res.status}` };
    const body = await res.json();
    const models = Array.isArray(body.models) ? body.models.map((m) => m.name).filter(Boolean) : [];
    return { running: true, models, error: null };
  } catch {
    return { running: false, models: [], error: 'Ollama is not running at this address.' };
  }
}

module.exports = { getStatus, normaliseBaseUrl, DEFAULT_URL };
