'use strict';

// Process supervision, progress tailing, and cancellation for training jobs.
// Runs purely in Node, testable without BrowserWindow.

const fs = require('node:fs');
const path = require('node:path');
const { runCli } = require('./python');

function readProgressEvents(jobDir) {
  const logPath = path.join(jobDir, 'progress.jsonl');
  if (!fs.existsSync(logPath)) return [];
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getLatestStep(jobDir) {
  const events = readProgressEvents(jobDir);
  const stepEvents = events.filter((e) => e.event === 'step');
  const lastStep = stepEvents[stepEvents.length - 1] || null;
  const completed = events.find((e) => e.event === 'completed');
  const cancelled = events.find((e) => e.event === 'cancelled');
  const error = events.find((e) => e.event === 'error');

  let status = 'idle';
  if (completed) status = 'completed';
  else if (cancelled) status = 'cancelled';
  else if (error) status = 'error';
  else if (stepEvents.length > 0) status = 'training';

  return {
    status,
    eventsCount: events.length,
    lastStep,
    error: error?.error || null,
    summary: completed?.summary || null,
  };
}

async function startTraining({
  interpreter,
  coreDir,
  trainFile,
  evalFile,
  outDir,
  model = 'llama3.2:1b',
  lr = 0.0002,
  epochs = 3,
  batchSize = 2,
  loraR = 16,
  quantization = '4bit',
  dryRun = false,
  exec,
}) {
  const args = [
    'train',
    '--train-file', trainFile,
    '--eval-file', evalFile,
    '--out', outDir,
    '--model', model,
    '--lr', String(lr),
    '--epochs', String(epochs),
    '--batch-size', String(batchSize),
    '--lora-r', String(loraR),
    '--quantization', quantization,
  ];
  if (dryRun) args.push('--dry-run');

  return runCli({ interpreter, coreDir, args, timeoutMs: 600_000, exec });
}

async function cancelTraining({ interpreter, coreDir, jobDir, exec }) {
  const args = ['train-cancel', '--job-dir', jobDir];
  return runCli({ interpreter, coreDir, args, timeoutMs: 30_000, exec });
}

module.exports = {
  readProgressEvents,
  getLatestStep,
  startTraining,
  cancelTraining,
};
