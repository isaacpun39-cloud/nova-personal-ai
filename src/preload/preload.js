'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The renderer only gets these named functions, never ipcRenderer, Node, or the environment.
contextBridge.exposeInMainWorld('nova', {
  chat: (text, confirmed = false) => ipcRenderer.invoke('nova:chat', { text: String(text), confirmed: confirmed === true }),
  status: () => ipcRenderer.invoke('nova:status'),
  getSettings: () => ipcRenderer.invoke('nova:settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('nova:settings:set', patch),
  getHistory: () => ipcRenderer.invoke('nova:history:get'),
  clearHistory: () => ipcRenderer.invoke('nova:history:clear'),
  onTimerDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nova:timer-done', listener);
    return () => ipcRenderer.removeListener('nova:timer-done', listener);
  },
});
