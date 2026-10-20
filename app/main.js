'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');

const { resolvePython, runCli } = require('./lib/python');
const { getStatus, normaliseBaseUrl } = require('./lib/ollama');
const { validateSelection } = require('./lib/files');
const { streamChat, indexDocuments, queryRag, evaluateRag } = require('./lib/chat');
const settingsStore = require('./lib/settings');

// Window and dock icon. Installers get their icons from package.json (build.*.icon).
const APP_ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// The directory that contains the `slmstudio` Python package.
const CORE_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'core')
  : path.join(__dirname, '..');

let mainWindow = null;
let pythonPromise = null;
let settingsFile = null;
let projectsDefault = null;

// One instance only: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function getPython() {
  if (!pythonPromise) {
    pythonPromise = resolvePython({ coreDir: CORE_DIR }).catch((err) => {
      pythonPromise = null; // allow retry after the user installs Python
      throw err;
    });
  }
  return pythonPromise;
}

function assertString(value, name, max = 4096) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function assertStringArray(value, name, max = 500) {
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== 'string')) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

async function cliOrError(args, timeoutMs) {
  const interpreter = await getPython();
  return runCli({ interpreter, coreDir: CORE_DIR, args, timeoutMs });
}

function wrap(handler) {
  return async (_event, ...args) => {
    try {
      return { ok: true, data: await handler(...args) };
    } catch (err) {
      return { ok: false, error: err.message || 'Something went wrong.' };
    }
  };
}

function registerIpc() {
  ipcMain.handle('settings:get', wrap(() => settingsStore.load(settingsFile, projectsDefault)));

  ipcMain.handle('settings:set', wrap((patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings.');
    const current = settingsStore.load(settingsFile, projectsDefault);
    return settingsStore.save(settingsFile, { ...current, ...patch }, projectsDefault);
  }));

  ipcMain.handle('files:pick', wrap(async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose your data files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Data files', extensions: ['jsonl', 'json', 'csv', 'tsv', 'txt', 'md'] }],
    });
    if (result.canceled) return { accepted: [], rejected: [] };
    return validateSelection(result.filePaths);
  }));

  ipcMain.handle('files:validate', wrap((paths, existing) => {
    assertStringArray(paths, 'file list');
    assertStringArray(existing || [], 'existing list');
    return validateSelection(paths, { existing: existing || [] });
  }));

  ipcMain.handle('data:prepare', wrap(async (paths, options) => {
    assertStringArray(paths, 'file list');
    if (paths.length === 0) throw new Error('Add at least one file first.');
    const settings = settingsStore.load(settingsFile, projectsDefault);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(settings.projectsDir, `run-${stamp}`);
    const fraction = options && Number.isFinite(options.evalFraction) ? options.evalFraction : settings.evalFraction;
    const payload = await cliOrError(
      ['prepare', '--files', ...paths, '--out', outDir, '--eval-fraction', String(fraction)],
      10 * 60_000,
    );
    if (!payload.ok) throw new Error(payload.error);
    return payload;
  }));

  ipcMain.handle('machine:profile', wrap(async () => {
    const payload = await cliOrError(['hardware'], 30_000);
    if (!payload.ok) throw new Error(payload.error);
    return payload;
  }));

  ipcMain.handle('ollama:status', wrap(async (url) => {
    const settings = settingsStore.load(settingsFile, projectsDefault);
    const target = url === undefined ? settings.ollamaUrl : normaliseBaseUrl(url);
    return getStatus(target);
  }));

  ipcMain.handle('python:status', wrap(async () => {
    try {
      const interpreter = await getPython();
      return { found: true, command: interpreter.join(' ') };
    } catch (err) {
      return { found: false, error: err.message };
    }
  }));

  ipcMain.handle('folder:open', wrap(async (folder) => {
    const target = assertString(folder, 'folder');
    const resolved = path.resolve(target);
    const allowed = path.resolve(settingsStore.load(settingsFile, projectsDefault).projectsDir);
    if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
      throw new Error('Only project folders can be opened from here.');
    }
    if (resolved === allowed) fs.mkdirSync(allowed, { recursive: true });
    if (!fs.existsSync(resolved)) throw new Error('That folder no longer exists.');
    const err = await shell.openPath(resolved);
    if (err) throw new Error('The folder could not be opened.');
    return true;
  }));

  ipcMain.handle('rag:index', wrap(async (filePaths) => {
    assertStringArray(filePaths, 'file paths');
    const settings = settingsStore.load(settingsFile, projectsDefault);
    fs.mkdirSync(settings.projectsDir, { recursive: true });
    const dbPath = path.join(settings.projectsDir, 'rag_store.sqlite');
    const interpreter = await getPython();
    const payload = await indexDocuments({
      interpreter,
      coreDir: CORE_DIR,
      dbPath,
      files: filePaths,
      embedder: 'fake',
      ollamaUrl: settings.ollamaUrl,
    });
    if (!payload.ok) throw new Error(payload.error);
    return payload;
  }));

  ipcMain.handle('rag:query', wrap(async (query) => {
    assertString(query, 'query');
    const settings = settingsStore.load(settingsFile, projectsDefault);
    const dbPath = path.join(settings.projectsDir, 'rag_store.sqlite');
    if (!fs.existsSync(dbPath)) return { retrieved_count: 0, citations: [], messages: [] };
    const interpreter = await getPython();
    const payload = await queryRag({
      interpreter,
      coreDir: CORE_DIR,
      dbPath,
      query,
      topK: 3,
      embedder: 'fake',
      ollamaUrl: settings.ollamaUrl,
    });
    if (!payload.ok) throw new Error(payload.error);
    return payload;
  }));

  ipcMain.handle('rag:eval', wrap(async (options) => {
    const settings = settingsStore.load(settingsFile, projectsDefault);
    const dbPath = path.join(settings.projectsDir, 'rag_store.sqlite');
    const evalFile = options?.evalFile || path.join(settings.projectsDir, 'eval.jsonl');
    const interpreter = await getPython();
    const payload = await evaluateRag({
      interpreter,
      coreDir: CORE_DIR,
      dbPath,
      evalFile,
      outDir: settings.projectsDir,
      model: options?.model || 'llama3.2:1b',
      embedder: 'fake',
      ollamaUrl: settings.ollamaUrl,
      useOllama: false,
    });
    if (!payload.ok) throw new Error(payload.error);
    return payload;
  }));

  ipcMain.handle('chat:send', wrap(async (options) => {
    const query = assertString(options.query, 'query');
    const settings = settingsStore.load(settingsFile, projectsDefault);
    const dbPath = path.join(settings.projectsDir, 'rag_store.sqlite');

    let citations = [];
    let messages = [{ role: 'user', content: query }];

    if (fs.existsSync(dbPath)) {
      try {
        const interpreter = await getPython();
        const ragRes = await queryRag({
          interpreter,
          coreDir: CORE_DIR,
          dbPath,
          query,
          topK: 3,
          embedder: 'fake',
          ollamaUrl: settings.ollamaUrl,
        });
        if (ragRes && ragRes.ok) {
          citations = ragRes.citations || [];
          messages = ragRes.messages || messages;
        }
      } catch (err) {
        console.warn('RAG lookup failed, falling back to direct prompt:', err);
      }
    }

    return new Promise((resolve, reject) => {
      let fullContent = '';
      streamChat({
        ollamaUrl: settings.ollamaUrl,
        model: options.model || 'llama3.2:1b',
        messages,
        onToken: (tok) => { fullContent += tok; },
        onDone: () => {
          resolve({ reply: fullContent, citations });
        },
        onError: (err) => {
          // If Ollama is not running, return simulated response along with citations
          resolve({
            reply: `[Ollama was not reachable at ${settings.ollamaUrl}. Ensure Ollama is running.]`,
            citations,
            warning: err.message,
          });
        },
      });
    });
  }));
}

function lockDownSession() {
  // The app talks only to the local Python core and, optionally, the user's Ollama.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'SLM Studio',
    icon: APP_ICON,
    backgroundColor: '#F2F2F7',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  projectsDefault = path.join(app.getPath('documents'), 'SLM Studio');
  lockDownSession();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
