'use strict';

(function () {
  const api = window.slm;
  const { formatBytes, formatGb, formatCount, GOALS } = window.SLMFormat;

  const TABS = [
    { id: 'goals', title: 'Goal', icon: 'M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z' },
    { id: 'data', title: 'Data', icon: 'M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z' },
    { id: 'chat', title: 'Chat', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z' },
    { id: 'machine', title: 'Machine', icon: 'M4 5h16v11H4zM2 18h20v2H2z' },
    { id: 'settings', title: 'Settings', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2.2-.6a7 7 0 00-.7-1.7l1.2-2-1.9-1.9-2 1.2a7 7 0 00-1.7-.7L14 3h-4l-.6 2.2a7 7 0 00-1.7.7l-2-1.2-1.9 1.9 1.2 2a7 7 0 00-.7 1.7L3 12l2.2.6a7 7 0 00.7 1.7l-1.2 2 1.9 1.9 2-1.2a7 7 0 001.7.7L10 21h4l.6-2.2a7 7 0 001.7-.7l2 1.2 1.9-1.9-1.2-2a7 7 0 00.7-1.7z' },
  ];

  const state = {
    tab: 'goals',
    settings: null,
    files: [],          // accepted: { path, name, size }
    rejected: [],       // { path, reason } for the last add attempt
    preparing: false,
    report: null,       // last successful prepare payload
    hardware: null,
    hardwareError: null,
    ollama: null,
    python: null,
    settingsNotice: null,
    chatMessages: [],   // { role, text, citations }
    chatSending: false,
    ragIndexing: false,
    ragEvalRunning: false,
    ragEvalResult: null,
  };

  // ---------- DOM helpers (never build HTML from user data) ----------

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function svgIcon(d) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  function toast(message, kind) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.dataset.kind = kind || 'info';
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel || 'Working…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  // ---------- Navigation ----------

  function renderTabbar() {
    const bar = document.getElementById('tabbar');
    bar.replaceChildren(...TABS.map((t) => el('button', {
      class: 'tab' + (state.tab === t.id ? ' tab-active' : ''),
      role: 'tab',
      'aria-selected': state.tab === t.id ? 'true' : 'false',
      onclick: () => go(t.id),
    }, svgIcon(t.icon), el('span', { text: t.title }))));
  }

  function go(tab) {
    state.tab = tab;
    render();
    document.getElementById('content').scrollTop = 0;
  }

  function render() {
    const current = TABS.find((t) => t.id === state.tab) || TABS[0];
    document.getElementById('nav-title').textContent = current.title;
    const content = document.getElementById('content');
    const views = { goals: viewGoals, data: viewData, chat: viewChat, machine: viewMachine, settings: viewSettings };
    content.replaceChildren(views[state.tab]());
    renderTabbar();
  }

  // ---------- Shared UI pieces ----------

  function largeTitle(text, sub) {
    return el('div', { class: 'large-title' },
      el('h1', { text }),
      sub ? el('p', { class: 'subtitle', text: sub }) : null);
  }

  function section(header, footer, ...rows) {
    return el('section', { class: 'section' },
      header ? el('h2', { class: 'section-header', text: header }) : null,
      el('div', { class: 'group' }, ...rows),
      footer ? el('p', { class: 'section-footer', text: footer }) : null);
  }

  function row(label, value, extra) {
    return el('div', { class: 'row' },
      el('span', { class: 'row-label', text: label }),
      el('span', { class: 'row-value', text: value }),
      extra || null);
  }

  function button(label, onclick, variant) {
    return el('button', { class: 'btn btn-' + (variant || 'filled'), onclick, type: 'button' }, label);
  }

  function emptyState(title, text) {
    return el('div', { class: 'empty' }, el('h3', { text: title }), el('p', { text }));
  }

  // ---------- Goals ----------

  function viewGoals() {
    const rows = Object.entries(GOALS).map(([id, g]) => {
      const selected = state.settings.goal === id;
      return el('button', {
        class: 'row row-button' + (selected ? ' row-selected' : ''),
        type: 'button',
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        onclick: () => chooseGoal(id),
      },
        el('div', { class: 'row-stack' },
          el('span', { class: 'row-title', text: g.title }),
          el('span', { class: 'row-detail', text: g.subtitle })),
        selected ? svgIcon('M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z') : null);
    });
    const current = GOALS[state.settings.goal];
    return el('div', { class: 'page' },
      largeTitle('Choose a goal', 'What should this model do for your team?'),
      section('Use case', 'You can change this at any time.', ...rows),
      section('What this path involves', null,
        el('div', { class: 'card' },
          el('p', { class: 'card-title', text: 'Data you need' }),
          el('p', { class: 'card-body', text: current.needs }),
          el('p', { class: 'card-title', text: 'How it works' }),
          el('p', { class: 'card-body', text: current.path }))),
      el('div', { class: 'footer-actions' }, button('Continue to Data', () => go('data'))));
  }

  async function chooseGoal(id) {
    try {
      state.settings = await unwrap(api.settings.set({ goal: id }));
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Data ----------

  function viewData() {
    const goal = GOALS[state.settings.goal];
    const dropZone = el('div', {
      class: 'dropzone',
      id: 'dropzone',
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('dropzone-active'); },
      ondragleave: (e) => e.currentTarget.classList.remove('dropzone-active'),
      ondrop: onDrop,
    },
      svgIcon('M12 3l-5 5h3v7h4V8h3zM5 19h14v2H5z'),
      el('p', { class: 'dropzone-title', text: 'Drop files here' }),
      el('p', { class: 'dropzone-hint', text: 'JSON, JSONL, CSV, TSV, TXT or Markdown. Up to 512 MB per file.' }),
      button('Choose files…', onChooseFiles, 'tinted'));

    const fileRows = state.files.map((f) => el('div', { class: 'row' },
      el('div', { class: 'row-stack' },
        el('span', { class: 'row-title', text: f.name }),
        el('span', { class: 'row-detail', text: formatBytes(f.size) })),
      el('button', { class: 'btn btn-plain btn-danger', type: 'button', onclick: () => removeFile(f.path) }, 'Remove')));

    const rejectedNotice = state.rejected.length
      ? el('div', { class: 'notice notice-error' },
          el('p', { text: 'Some files were not added:' }),
          el('ul', null, ...state.rejected.map((r) => el('li', { text: r.reason }))))
      : null;

    const canPrepare = state.files.length > 0 && !state.preparing;
    const prepareBtn = el('button', {
      class: 'btn btn-filled btn-wide',
      id: 'prepare-btn',
      type: 'button',
      disabled: !canPrepare,
      onclick: onPrepare,
    }, 'Check and prepare data');

    return el('div', { class: 'page' },
      largeTitle('Your data', `Goal: ${goal.title}. ${goal.needs}`),
      dropZone,
      rejectedNotice,
      state.files.length
        ? section('Selected files', `${state.files.length} file${state.files.length === 1 ? '' : 's'} ready.`, ...fileRows)
        : null,
      el('div', { class: 'footer-actions' }, prepareBtn),
      state.report ? renderReport(state.report) : null);
  }

  function onDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dropzone-active');
    const paths = [...(event.dataTransfer?.files || [])]
      .map((f) => api.files.pathFor(f))
      .filter(Boolean);
    if (paths.length === 0) {
      toast('Could not read the dropped files. Use "Choose files" instead.', 'error');
      return;
    }
    addPaths(paths);
  }

  async function onChooseFiles() {
    try {
      const result = await unwrap(api.files.pick());
      applyValidation(result);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function addPaths(paths) {
    try {
      const existing = state.files.map((f) => f.path);
      const result = await unwrap(api.files.validate(paths, existing));
      applyValidation(result, true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function applyValidation(result, append) {
    state.rejected = result.rejected || [];
    const incoming = result.accepted || [];
    state.files = append ? [...state.files, ...incoming] : incoming;
    if (incoming.length) state.report = null;
    render();
  }

  function removeFile(p) {
    state.files = state.files.filter((f) => f.path !== p);
    state.rejected = [];
    state.report = null;
    render();
  }

  async function onPrepare(event) {
    const button = event.currentTarget;
    state.preparing = true;
    setBusy(button, true, 'Checking data…');
    try {
      state.report = await unwrap(api.data.prepare(state.files.map((f) => f.path)));
      toast('Data prepared.', 'success');
    } catch (err) {
      state.report = null;
      toast(err.message, 'error');
    } finally {
      state.preparing = false;
      render();
    }
  }

  function renderReport(payload) {
    const r = payload.report;
    const tiles = [
      ['Valid', r.rows_valid],
      ['Invalid', r.rows_invalid],
      ['Duplicates removed', r.duplicates_removed],
      ['Training', r.train_size],
      ['Evaluation', r.eval_size],
    ];
    const grid = el('div', { class: 'stats' }, ...tiles.map(([label, value]) =>
      el('div', { class: 'stat' },
        el('span', { class: 'stat-value', text: formatCount(value) }),
        el('span', { class: 'stat-label', text: label }))));

    const warnings = (r.warnings || []).map((w) => el('div', { class: 'notice notice-warn', text: w }));
    const loadErrors = (r.load_errors || []).map((e) => el('div', { class: 'notice notice-error', text: e }));
    const invalid = (r.invalid_examples || []).slice(0, 50);

    return el('div', { class: 'report' },
      section('Result', `Read ${formatCount(r.rows_read)} rows from ${r.files.length} file${r.files.length === 1 ? '' : 's'}.`, grid),
      ...warnings,
      ...loadErrors,
      invalid.length
        ? section('Rows that need fixing', 'Each row is shown with its file and line number.',
            ...invalid.map((text) => el('div', { class: 'row row-wrap' }, el('span', { class: 'mono', text }))))
        : null,
      el('div', { class: 'footer-actions' },
        button('Show project folder', () => openFolder(payload.out_dir), 'tinted')));
  }

  async function openFolder(folder) {
    try {
      await unwrap(api.folder.open(folder));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Chat & RAG ----------

  function viewChat() {
    const hasFiles = state.files && state.files.length > 0;

    const indexAction = section('Knowledge Base', 'Indexes selected documents for local grounding and source citations.',
      el('div', { class: 'row' },
        el('span', { text: hasFiles ? `${state.files.length} document(s) available` : 'No documents selected in Data tab' }),
        button(state.ragIndexing ? 'Indexing…' : 'Index for RAG', onIndexRag, 'tinted', !hasFiles || state.ragIndexing)
      )
    );

    const messageNodes = state.chatMessages.map((msg) => {
      const isUser = msg.role === 'user';
      const bubble = el('div', { class: 'chat-bubble', text: msg.text });

      const citationsNode = (!isUser && msg.citations && msg.citations.length > 0)
        ? el('div', { class: 'citations-list' },
            el('span', { class: 'row-caption', text: 'Sources cited:' }),
            ...msg.citations.map((c) => el('div', { class: 'citation-card' },
              el('div', { class: 'citation-head' },
                el('span', { class: 'citation-badge', text: `[${c.index}]` }),
                el('span', { text: `${c.source_file} (L${c.line_start}-L${c.line_end})` }),
                el('span', { class: 'row-caption', text: c.section })
              ),
              el('div', { class: 'citation-preview', text: c.preview })
            ))
          )
        : null;

      return el('div', { class: `chat-msg chat-msg-${msg.role}` }, bubble, citationsNode);
    });

    const historySection = section('Conversation', null,
      messageNodes.length
        ? el('div', { class: 'chat-history' }, ...messageNodes)
        : el('div', { class: 'empty', text: 'No messages yet. Ask a question about your indexed documents.' })
    );

    const inputField = el('input', {
      class: 'chat-input',
      type: 'text',
      placeholder: 'Ask a question…',
      onkeydown: (e) => { if (e.key === 'Enter') onSendChat(); },
    });

    const inputBar = el('div', { class: 'chat-input-bar' },
      inputField,
      button('Send', () => onSendChat(inputField), 'filled', state.chatSending)
    );

    const evalRows = [];
    if (state.ragEvalResult) {
      const s = state.ragEvalResult.summary;
      evalRows.push(
        row('Evaluated records', String(s.records_evaluated)),
        row('Base model F1', String(s.scores.base.avg_f1)),
        row('Base+RAG F1', String(s.scores.rag.avg_f1)),
        row('Delta F1', (s.scores.rag_delta_f1 >= 0 ? '+' : '') + String(s.scores.rag_delta_f1)),
        el('div', { class: 'card' },
          el('p', { class: 'card-title', text: 'Verdict' }),
          el('p', { class: 'card-body', text: s.recommendation }))
      );
    }

    const evalSection = section('RAG Evaluation', 'Compares base model against base-with-RAG on eval.jsonl.',
      el('div', { class: 'row' },
        el('span', { text: 'Held-out set evaluation' }),
        button(state.ragEvalRunning ? 'Evaluating…' : 'Run Evaluation', onRunEval, 'tinted', state.ragEvalRunning)
      ),
      ...evalRows
    );

    return el('div', { class: 'page' },
      largeTitle('Chat & RAG', 'Ask questions grounded in your local documents with verifiable sources.'),
      indexAction,
      historySection,
      section(null, null, inputBar),
      evalSection
    );
  }

  async function onIndexRag() {
    if (!state.files.length) return;
    state.ragIndexing = true;
    render();
    try {
      const paths = state.files.map((f) => f.path);
      const res = await unwrap(api.chat.index(paths));
      toast(`Indexed ${res.indexed_docs} docs (${res.total_chunks} chunks).`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      state.ragIndexing = false;
      render();
    }
  }

  async function onSendChat(inputEl) {
    const input = inputEl || document.querySelector('.chat-input');
    if (!input || !input.value.trim() || state.chatSending) return;
    const query = input.value.trim();
    input.value = '';

    state.chatMessages.push({ role: 'user', text: query, citations: [] });
    state.chatSending = true;
    render();

    try {
      const res = await unwrap(api.chat.send({ query }));
      state.chatMessages.push({
        role: 'assistant',
        text: res.reply || '(No answer)',
        citations: res.citations || [],
      });
      if (res.warning) toast(res.warning, 'info');
    } catch (err) {
      state.chatMessages.push({
        role: 'assistant',
        text: `Error: ${err.message}`,
        citations: [],
      });
      toast(err.message, 'error');
    } finally {
      state.chatSending = false;
      render();
    }
  }

  async function onRunEval() {
    state.ragEvalRunning = true;
    render();
    try {
      const res = await unwrap(api.chat.eval());
      state.ragEvalResult = res;
      toast('Evaluation complete.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      state.ragEvalRunning = false;
      render();
    }
  }

  // ---------- Machine ----------

  function viewMachine() {
    const hw = state.hardware;
    const rec = hw ? hw.recommendation : null;
    const profile = hw ? hw.hardware : null;

    const hardwareRows = profile ? [
      row('System', profile.os || 'Unknown'),
      row('Processor', profile.cpu_model || 'Not detected'),
      row('Cores', profile.cpu_cores ? String(profile.cpu_cores) : 'Not detected'),
      row('Memory', formatGb(profile.ram_gb)),
      row('Graphics', profile.gpu_name || 'None detected'),
      row('Graphics memory', formatGb(profile.gpu_vram_gb)),
    ] : [];

    const ollamaRows = state.ollama ? [
      row('Status', state.ollama.running ? 'Running' : 'Not running'),
      row('Address', state.settings.ollamaUrl),
      row('Models', state.ollama.running
        ? (state.ollama.models.length ? String(state.ollama.models.length) : 'None installed')
        : '—'),
    ] : [];

    const modelRows = state.ollama && state.ollama.running && state.ollama.models.length
      ? state.ollama.models.map((m) => el('div', { class: 'row' }, el('span', { class: 'mono', text: m })))
      : [];

    return el('div', { class: 'page' },
      largeTitle('This machine', 'What this computer can run, and whether Ollama is ready.'),
      state.hardwareError ? el('div', { class: 'notice notice-error', text: state.hardwareError }) : null,
      hardwareRows.length ? section('Hardware', null, ...hardwareRows) : null,
      rec ? section('Recommendation', null,
        el('div', { class: 'card' },
          el('p', { class: 'card-title', text: rec.recommended ? `Recommended: ${rec.recommended}` : 'No model recommended' }),
          el('p', { class: 'card-body', text: rec.message }),
          rec.usable_memory_gb !== undefined
            ? el('p', { class: 'card-caption', text: `About ${formatGb(rec.usable_memory_gb)} is available for models.` })
            : null)) : null,
      state.python ? section('Python', state.python.found ? null : 'Install Python 3.10 or newer, then press Refresh.',
        row('Core engine', state.python.found ? 'Ready' : 'Not found')) : null,
      state.ollama ? section('Ollama', state.ollama.running ? null : 'Start Ollama on this computer, then press Refresh.', ...ollamaRows, ...modelRows) : null,
      el('div', { class: 'footer-actions' }, button('Refresh', refreshMachine, 'tinted')));
  }

  async function refreshMachine() {
    state.hardwareError = null;
    const tasks = await Promise.allSettled([
      unwrap(api.machine.profile()),
      unwrap(api.ollama.status(state.settings.ollamaUrl)),
      unwrap(api.python.status()),
    ]);
    if (tasks[0].status === 'fulfilled') state.hardware = tasks[0].value;
    else { state.hardware = null; state.hardwareError = tasks[0].reason.message; }
    state.ollama = tasks[1].status === 'fulfilled' ? tasks[1].value : { running: false, models: [], error: tasks[1].reason.message };
    state.python = tasks[2].status === 'fulfilled' ? tasks[2].value : { found: false };
    render();
  }

  // ---------- Settings ----------

  function viewSettings() {
    const urlInput = el('input', {
      class: 'field',
      id: 'ollama-url',
      type: 'url',
      value: state.settings.ollamaUrl,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Ollama address',
    });
    const frac = Math.round(state.settings.evalFraction * 100);
    const fracLabel = el('span', { class: 'row-value', id: 'frac-label', text: `${frac}%` });
    const slider = el('input', {
      class: 'slider',
      id: 'eval-fraction',
      type: 'range',
      min: '2',
      max: '50',
      step: '1',
      value: String(frac),
      'aria-label': 'Share of data kept for evaluation',
      oninput: (e) => { fracLabel.textContent = `${e.target.value}%`; },
    });

    return el('div', { class: 'page' },
      largeTitle('Settings', null),
      section('Ollama', 'The address of the Ollama server that runs your models. Keep it on this machine or on your own network.',
        el('div', { class: 'row row-field' }, el('span', { class: 'row-label', text: 'Address' }), urlInput)),
      section('Evaluation', 'Part of your data is held back to measure the model fairly. It is never used for training.',
        el('div', { class: 'row row-field' },
          el('span', { class: 'row-label', text: 'Held-out share' }), fracLabel),
        el('div', { class: 'row row-field' }, slider)),
      section('Project folder', 'Prepared data and reports are saved here.',
        row('Location', state.settings.projectsDir, button('Open', () => openFolder(state.settings.projectsDir), 'plain'))),
      state.settingsNotice ? el('div', { class: 'notice notice-success', text: state.settingsNotice }) : null,
      el('div', { class: 'footer-actions' }, button('Save changes', () => saveSettings(urlInput.value, Number(slider.value) / 100))));
  }

  async function saveSettings(url, fraction) {
    try {
      state.settings = await unwrap(api.settings.set({ ollamaUrl: url, evalFraction: fraction }));
      state.settingsNotice = 'Settings saved.';
      toast('Settings saved.', 'success');
      render();
      setTimeout(() => { state.settingsNotice = null; }, 2500);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Startup ----------

  async function unwrap(promise) {
    const result = await promise;
    if (!result || result.ok === false) throw new Error((result && result.error) || 'Something went wrong.');
    return result.data !== undefined ? result.data : result;
  }

  async function start() {
    try {
      state.settings = await unwrap(api.settings.get());
    } catch (err) {
      state.settings = { goal: 'qa', ollamaUrl: 'http://127.0.0.1:11434', evalFraction: 0.1, projectsDir: '' };
      toast(`Using default settings: ${err.message}`, 'error');
    }
    render();
    refreshMachine();
  }

  start();
})();
