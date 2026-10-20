'use strict';

// Pure formatting helpers. Usable in the browser and in Node tests.

(function (root) {
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
  }

  function formatGb(gb) {
    if (gb === null || gb === undefined || !Number.isFinite(gb)) return 'Not detected';
    return `${gb} GB`;
  }

  function formatCount(n) {
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  const GOALS = {
    qa: {
      title: 'Knowledge Q&A',
      subtitle: 'Answers questions from your documents and cites the source.',
      needs: 'Question and answer pairs, or chat records.',
      path: 'Starts with retrieval over your documents. Fine-tuning is optional and only added when it measurably helps.',
    },
    triage: {
      title: 'Ticket triage',
      subtitle: 'Classifies and routes requests the way your team already does.',
      needs: 'Past tickets with their category, priority, and routing.',
      path: 'Fine-tunes on labelled past tickets and checks the result on held-out tickets.',
    },
    command: {
      title: 'Command assistant',
      subtitle: 'Suggests the right internal command for a request. Suggest-only.',
      needs: 'Request and command pairs from your runbooks or history.',
      path: 'Fine-tunes on request and command pairs. Nothing runs without your approval.',
    },
  };

  const api = { formatBytes, formatGb, formatCount, GOALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SLMFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
