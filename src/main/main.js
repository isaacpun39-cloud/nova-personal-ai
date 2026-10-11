'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, session, Notification, net } = require('electron');

try {
  // .env in the user data folder (installed app) or the project root (development).
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(app.getPath('userData'), '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
} catch {
  console.warn('dotenv not installed; using real environment variables only.');
}

const { buildDefaults, createSettingsStore, getApiKey, getGeminiKey } = require('./config');
const { createHistoryStore } = require('./historyStore');
const { createAIService } = require('./services/aiService');
const { createNoteService } = require('./services/noteService');
const { createTimerService } = require('./services/timerService');
const { createPcActions } = require('./services/pcActions');
const { createHandlers, registerIpc } = require('./ipc');

let mainWindow = null;
let timerService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 520,
    minHeight: 480,
    backgroundColor: '#0b1020',
    title: 'NOVA',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupSecurity() {
  // Only the microphone may be requested; everything else is denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');
}

function setupServices() {
  const userData = app.getPath('userData');
  const documents = app.getPath('documents');
  const settingsStore = createSettingsStore({ filePath: path.join(userData, 'settings.json'), defaults: buildDefaults(process.env, documents) });
  const historyStore = createHistoryStore({ filePath: path.join(userData, 'history.json') });
  const aiService = createAIService({ getSettings: settingsStore.get, getApiKey, getGeminiKey, fetchImpl: (url, init) => net.fetch(url, init) });
  const noteService = createNoteService({ baseDir: path.join(documents, 'NOVA Notes') });

  timerService = createTimerService({
    onDone: ({ label }) => {
      const text = `Your ${label} is done.`;
      if (mainWindow) mainWindow.webContents.send('nova:timer-done', { label: text });
      if (Notification.isSupported()) new Notification({ title: 'NOVA', body: text }).show();
    },
  });

  const pcActions = createPcActions({
    openExternal: (url) => shell.openExternal(url),
    openPath: (p) => shell.openPath(p),
    noteService,
    timerService,
    getSettings: settingsStore.get,
  });

  const handlers = createHandlers({ settingsStore, historyStore, aiService, pcActions });
  registerIpc({ ipcMain, handlers, isTrustedSender: (event) => Boolean(mainWindow) && event.sender === mainWindow.webContents });
}

app.whenReady().then(() => {
  setupSecurity();
  setupServices();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { if (timerService) timerService.cancelAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
