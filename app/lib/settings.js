'use strict';

// Settings are stored as JSON in the user's app data folder.
// Writes are atomic (temp file + rename) so a crash cannot leave a half-written file.

const fs = require('node:fs');
const path = require('node:path');
const { normaliseBaseUrl, DEFAULT_URL } = require('./ollama');

const GOALS = ['qa', 'triage', 'command'];

const DEFAULTS = Object.freeze({
  goal: 'qa',
  ollamaUrl: DEFAULT_URL,
  evalFraction: 0.1,
  projectsDir: null, // filled in by main.js to <userData>/projects
});

function sanitise(input, projectsDefault) {
  const out = { ...DEFAULTS, projectsDir: projectsDefault, ...(input || {}) };
  if (!GOALS.includes(out.goal)) out.goal = DEFAULTS.goal;
  try {
    out.ollamaUrl = normaliseBaseUrl(out.ollamaUrl);
  } catch {
    out.ollamaUrl = DEFAULT_URL;
  }
  const frac = Number(out.evalFraction);
  out.evalFraction = Number.isFinite(frac) ? Math.min(0.5, Math.max(0.02, frac)) : DEFAULTS.evalFraction;
  if (typeof out.projectsDir !== 'string' || out.projectsDir.length === 0) out.projectsDir = projectsDefault;
  return out;
}

function load(file, projectsDefault) {
  try {
    return sanitise(JSON.parse(fs.readFileSync(file, 'utf-8')), projectsDefault);
  } catch {
    return sanitise({}, projectsDefault);
  }
}

function save(file, settings, projectsDefault) {
  const clean = sanitise(settings, projectsDefault);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  return clean;
}

module.exports = { load, save, sanitise, GOALS, DEFAULTS };
