'use strict';

(function () {
  const api = window.slm;
  const { formatBytes, formatGb, formatCount, GOALS } = window.SLMFormat;

  const TABS = [
    { id: 'goals', title: 'Goal', shortcut: '⌘1', icon: 'M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z' },
    { id: 'data', title: 'Data', shortcut: '⌘2', icon: 'M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z' },
    { id: 'chat', title: 'Chat & RAG', shortcut: '⌘3', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z' },
    { id: 'train', title: 'Train LoRA', shortcut: '⌘4', icon: 'M13 3L4 14h7v7l9-11h-7z' },
    { id: 'machine', title: 'Machine', shortcut: '⌘5', icon: 'M4 5h16v11H4zM2 18h20v2H2z' },
    { id: 'settings', title: 'Settings', shortcut: '⌘6', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2.2-.6a7 7 0 00-.7-1.7l1.2-2-1.9-1.9-2 1.2a7 7 0 00-1.7-.7L14 3h-4l-.6 2.2a7 7 0 00-1.7.7l-2-1.2-1.9 1.9 1.2 2a7 7 0 00-.7 1.7L3 12l2.2.6a7 7 0 00.7 1.7l-1.2 2 1.9 1.9 2-1.2a7 7 0 001.7.7L10 21h4l.6-2.2a7 7 0 001.7-.7l2 1.2 1.9-1.9-1.2-2a7 7 0 00.7-1.7z' },
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
    trainingStatus: 'idle',
    trainingStep: null,
    trainingSummary: null,
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

  function svgIcon(d, extraClass) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', extraClass ? `icon ${extraClass}` : 'icon');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /** Creates an icon badge with a gradient background for goal/feature cards */
  function iconBadge(d, colorClass) {
    return el('div', { class: `icon-badge ${colorClass || 'badge-blue'}` }, svgIcon(d));
  }

  /** File extension → format tag label */
  function formatTag(name) {
    const ext = (name || '').split('.').pop().toUpperCase();
    const map = { JSON: 'JSON', JSONL: 'JSONL', CSV: 'CSV', TSV: 'TSV', TXT: 'TXT', MD: 'MD' };
    return map[ext] || 'FILE';
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

  /** Update the status indicators to reflect Ollama / system state */
  function updateStatusChip(online) {
    const dot = document.getElementById('system-status-dot');
    const text = document.getElementById('system-status-text');
    const quickText = document.getElementById('quick-hw-text');
    if (dot && text) {
      if (online) {
        dot.className = 'status-dot';
        text.textContent = 'Ollama Connected';
        if (quickText) quickText.textContent = 'Ollama & Core Active';
      } else {
        dot.className = 'status-dot status-dot-offline';
        text.textContent = 'Ollama Offline';
        if (quickText) quickText.textContent = 'Core Ready (Ollama Offline)';
      }
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
    },
      svgIcon(t.icon),
      el('span', { text: t.title }),
      t.shortcut ? el('span', { class: 'tab-shortcut', text: t.shortcut }) : null
    )));
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
    const views = {
      goals: viewGoals,
      data: viewData,
      chat: viewChat,
      train: viewTrain,
      machine: viewMachine,
      settings: viewSettings,
    };
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

  /** Icon paths for each goal type */
  const GOAL_ICONS = {
    qa: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z',
    summarise: 'M4 4h16v2H4zM4 8h12v2H4zM4 12h16v2H4zM4 16h8v2H4z',
    classify: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    extract: 'M14 2H6c-1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    draft: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  };

  /** Badge color for each goal type */
  const GOAL_COLORS = {
    qa: 'badge-blue',
    summarise: 'badge-purple',
    classify: 'badge-orange',
    extract: 'badge-green',
    draft: 'badge-teal',
  };

  function viewGoals() {
    const goalEntries = Object.entries(GOALS);
    const cards = goalEntries.map(([id, g]) => {
      const selected = state.settings.goal === id;
      const iconPath = GOAL_ICONS[id] || GOAL_ICONS.qa;
      const badgeColor = GOAL_COLORS[id] || 'badge-blue';
      return el('button', {
        class: 'goal-card' + (selected ? ' goal-card-active' : ''),
        type: 'button',
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        onclick: () => chooseGoal(id),
      },
        iconBadge(iconPath, badgeColor),
        el('div', { class: 'row-stack' },
          el('span', { class: 'row-title', text: g.title }),
          el('span', { class: 'row-detail', text: g.subtitle })),
        selected
          ? svgIcon('M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z', 'check-icon')
          : el('span', { class: 'chevron', text: '›' }));
    });
    const current = GOALS[state.settings.goal];
    return el('div', { class: 'page' },
      largeTitle('Choose an Objective', 'Fine-tune or ground a small language model on your own hardware.'),
      el('div', { class: 'goals-grid' }, ...cards),
      section('Architecture & Pathway', null,
        el('div', { class: 'card' },
          el('p', { class: 'card-title', text: 'Dataset Requirements' }),
          el('p', { class: 'card-body', text: current.needs }),
          el('p', { class: 'card-title', text: 'Engine Execution Pipeline' }),
          el('p', { class: 'card-body', text: current.path }))),
      el('div', { class: 'footer-actions' }, button('Continue to Data →', () => go('data'), 'filled btn-wide')));
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

    const fileRows = state.files.map((f) => el('div', { class: 'file-item' },
      el('div', { class: 'row-stack' },
        el('span', { class: 'row-title', text: f.name }),
        el('span', { class: 'row-detail', text: formatBytes(f.size) })),
      el('span', { class: 'format-tag', text: formatTag(f.name) }),
      el('button', { class: 'btn btn-plain btn-danger', type: 'button', onclick: () => removeFile(f.path) }, '✕')));

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

    const sendBtn = el('button', {
      class: 'chat-send-btn',
      type: 'button',
      disabled: state.chatSending,
      onclick: () => onSendChat(inputField),
      'aria-label': 'Send',
    }, svgIcon('M2.01 21L23 12 2.01 3 2 10l15 2-15 2z'));

    const inputBar = el('div', { class: 'chat-input-bar' },
      inputField,
      sendBtn
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

  // ---------- Train (LoRA SFT) ----------

  function viewTrain() {
    const isTraining = state.trainingStatus === 'training';

    const paramRows = [
      row('Base Model', 'Llama 3.2 (1B) • Instruct'),
      row('Method', 'LoRA (Low-Rank Parameter-Efficient Adaptation)'),
      row('Quantization', '4-bit NormalFloat (NF4) via bitsandbytes'),
      row('LoRA Rank & Alpha', 'r = 16, alpha = 32 (Dropout: 0.05)'),
      row('Target Projection Modules', 'q_proj, k_proj, v_proj, o_proj'),
      row('Engine Execution Status', state.trainingStatus.toUpperCase()),
    ];

    let progressSection = null;
    if (state.trainingStep) {
      const step = state.trainingStep;
      const bar = el('div', { class: 'progress-bar' });
      bar.style.width = `${step.percent}%`;
      const container = el('div', { class: 'progress-container' }, bar);

      progressSection = section('Live Fine-Tuning Telemetry', null,
        el('div', { class: 'row' },
          el('span', { class: 'row-title', text: `Step ${step.step} of ${step.total_steps} (${step.percent}%)` }),
          el('span', { class: 'format-tag', text: `Loss: ${step.loss}` })),
        container,
        el('div', { class: 'row' },
          el('span', { class: 'row-caption', text: `Epoch ${step.epoch} • Learning Rate: ${step.learning_rate}` }),
          step.eta_seconds ? el('span', { class: 'row-caption', text: `ETA: ${Math.round(step.eta_seconds)}s remaining` }) : null)
      );
    }

    let summarySection = null;
    if (state.trainingSummary) {
      summarySection = section('Training Run Artifacts', 'LoRA adapter checkpoint saved to your project directory.',
        row('Final Evaluated Loss', String(state.trainingSummary.final_loss)),
        row('Total Elapsed Duration', `${state.trainingSummary.total_time_seconds}s`),
        row('Adapter Checkpoint Path', state.trainingSummary.adapter_dir)
      );
    }

    const actionButtons = el('div', { class: 'footer-actions' },
      isTraining
        ? button('Cancel Training Run', onCancelTrain, 'destructive')
        : button('Start LoRA Fine-Tuning →', () => onStartTrain(false), 'filled'),
      !isTraining
        ? button('Dry Run (Simulate)', () => onStartTrain(true), 'tinted')
        : null
    );

    return el('div', { class: 'page' },
      largeTitle('Train Model', 'Fine-tune small language models on-premise with LoRA and PEFT without data leakage.'),
      section('Hyperparameter Configuration', 'Optimized for local consumer GPUs and unified memory.', ...paramRows),
      progressSection,
      summarySection,
      actionButtons
    );
  }

  async function onStartTrain(dryRun) {
    state.trainingStatus = 'training';
    state.trainingStep = { step: 0, total_steps: 100, percent: 0, loss: 2.5, epoch: 0, learning_rate: 0.0002 };
    state.trainingSummary = null;
    render();

    try {
      const res = await unwrap(api.train.start({ dryRun }));
      if (res.ok) {
        state.trainingStatus = 'completed';
        state.trainingSummary = res.summary;
        state.trainingStep = { step: 100, total_steps: 100, percent: 100, loss: res.summary?.final_loss || 0.4, epoch: 3, learning_rate: 0 };
        toast('Training completed successfully.', 'success');
      } else {
        state.trainingStatus = res.cancelled ? 'cancelled' : 'error';
        toast(res.error || 'Training ended.', res.cancelled ? 'info' : 'error');
      }
    } catch (err) {
      state.trainingStatus = 'error';
      toast(err.message, 'error');
    } finally {
      render();
    }
  }

  async function onCancelTrain() {
    try {
      await unwrap(api.train.cancel());
      state.trainingStatus = 'cancelled';
      toast('Cancellation requested.', 'info');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- Machine ----------

  function viewMachine() {
    const hw = state.hardware;
    const rec = hw ? hw.recommendation : null;
    const profile = hw ? hw.hardware : null;

    const hardwareRows = profile ? [
      row('Operating System', profile.os || 'Unknown'),
      row('Processor Architecture', profile.cpu_model || 'Not detected'),
      row('CPU Compute Cores', profile.cpu_cores ? `${profile.cpu_cores} physical / logical cores` : 'Not detected'),
      row('System Unified RAM', formatGb(profile.ram_gb)),
      row('Dedicated Graphics Accelerator', profile.gpu_name || 'None detected (CPU execution fallback)'),
      row('Available Graphics Memory (VRAM)', formatGb(profile.gpu_vram_gb)),
    ] : [];

    const ollamaRows = state.ollama ? [
      row('Ollama Daemon Status', state.ollama.running ? 'Connected & Listening' : 'Daemon Offline'),
      row('API Endpoint URL', state.settings.ollamaUrl),
      row('Locally Cached Models', state.ollama.running
        ? (state.ollama.models.length ? `${state.ollama.models.length} model(s) available` : 'None installed')
        : '—'),
    ] : [];

    const modelTags = state.ollama && state.ollama.running && state.ollama.models.length
      ? el('div', { class: 'row row-wrap' },
          ...state.ollama.models.map((m) => el('span', { class: 'format-tag', text: m })))
      : null;

    return el('div', { class: 'page' },
      largeTitle('Hardware & Environment', 'Local compute diagnostics, accelerator capability, and Ollama server status.'),
      state.hardwareError ? el('div', { class: 'notice notice-error', text: state.hardwareError }) : null,
      rec ? section('Compute Recommendation', null,
        el('div', { class: 'card' },
          el('div', { class: 'citation-head' },
            el('span', { class: 'format-tag', text: 'OPTIMAL ARCHITECTURE' }),
            el('span', { class: 'card-title', text: rec.recommended ? rec.recommended : 'Standard CPU Baseline' })
          ),
          el('p', { class: 'card-body', text: rec.message }),
          rec.usable_memory_gb !== undefined
            ? el('p', { class: 'card-caption', text: `Allocatable model memory: ~${formatGb(rec.usable_memory_gb)} available for weights & KV cache.` })
            : null)) : null,
      hardwareRows.length ? section('Hardware Telemetry', 'Detected by local hardware profiler.', ...hardwareRows) : null,
      state.python ? section('Core Python Runtime', state.python.found ? 'Local isolated sidecar execution environment.' : 'Install Python 3.10 or newer, then press Refresh.',
        row('Core Engine Status', state.python.found ? 'Ready (Python isolated runtime)' : 'Not found')) : null,
      state.ollama ? section('Ollama Server', state.ollama.running ? 'Local inference server for fast on-device generation.' : 'Start Ollama on this computer, then press Refresh.', ...ollamaRows, modelTags || null) : null,
      el('div', { class: 'footer-actions' }, button('Refresh Telemetry ↻', refreshMachine, 'tinted')));
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
    updateStatusChip(state.ollama && state.ollama.running);
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
    const fracLabel = el('span', { class: 'format-tag', id: 'frac-label', text: `${frac}% Held-out` });
    const slider = el('input', {
      class: 'slider',
      id: 'eval-fraction',
      type: 'range',
      min: '2',
      max: '50',
      step: '1',
      value: String(frac),
      'aria-label': 'Share of data kept for evaluation',
      oninput: (e) => { fracLabel.textContent = `${e.target.value}% Held-out`; },
    });

    return el('div', { class: 'page' },
      largeTitle('Workbench Settings', 'Configure local inference endpoints, test dataset splits, and project persistence directories.'),
      section('Ollama Inference Server', 'The address of the local or on-premise Ollama server. Keep it on 127.0.0.1 or your private corporate network.',
        el('div', { class: 'row row-field' }, el('span', { class: 'row-label', text: 'API Endpoint Host' }), urlInput)),
      section('Evaluation Dataset Partitioning', 'Reserved validation fraction held back to benchmark accuracy and prevent data leakage.',
        el('div', { class: 'row row-field' },
          el('span', { class: 'row-label', text: 'Held-out Evaluation Split' }), fracLabel),
        el('div', { class: 'row row-field' }, slider)),
      section('Project Workspace Directory', 'Prepared datasets, tokenized caches, evaluation benchmarks, and LoRA adapters are saved here.',
        row('Local Storage Location', state.settings.projectsDir, button('Reveal Folder', () => openFolder(state.settings.projectsDir), 'plain'))),
      state.settingsNotice ? el('div', { class: 'notice notice-success', text: state.settingsNotice }) : null,
      el('div', { class: 'footer-actions' }, button('Save Settings', () => saveSettings(urlInput.value, Number(slider.value) / 100), 'filled')));
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

  // ---------- Keyboard shortcuts ----------

  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + 1..6 switches tabs
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        e.preventDefault();
        go(TABS[idx].id);
      }
    }
  });

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
