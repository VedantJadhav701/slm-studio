'use strict';

// The only bridge between the page and the main process. Each channel is listed explicitly.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const CHANNELS = [
  'settings:get',
  'settings:set',
  'files:pick',
  'files:validate',
  'data:prepare',
  'machine:profile',
  'ollama:status',
  'python:status',
  'folder:open',
  'chat:send',
  'rag:index',
  'rag:query',
  'rag:eval',
  'train:start',
  'train:status',
  'train:cancel',
];

function invoke(channel, ...args) {
  if (!CHANNELS.includes(channel)) {
    return Promise.reject(new Error('Blocked channel'));
  }
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('slm', {
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
  },
  files: {
    pick: () => invoke('files:pick'),
    validate: (paths, existing) => invoke('files:validate', paths, existing),
    // Drag-and-drop: converts a dropped File into its real path.
    pathFor: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
  },
  data: {
    prepare: (paths, options) => invoke('data:prepare', paths, options),
  },
  machine: {
    profile: () => invoke('machine:profile'),
  },
  ollama: {
    status: (url) => invoke('ollama:status', url),
  },
  python: {
    status: () => invoke('python:status'),
  },
  folder: {
    open: (folder) => invoke('folder:open', folder),
  },
  chat: {
    send: (opts) => invoke('chat:send', opts),
    index: (opts) => invoke('rag:index', opts),
    query: (opts) => invoke('rag:query', opts),
    eval: (opts) => invoke('rag:eval', opts),
  },
  train: {
    start: (opts) => invoke('train:start', opts),
    status: (opts) => invoke('train:status', opts),
    cancel: (opts) => invoke('train:cancel', opts),
  },
});
