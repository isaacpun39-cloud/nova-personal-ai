'use strict';
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');

// Fixed command mappings: nothing the user or a model types is ever placed into a command.
const APPS = { notepad: { exe: 'notepad.exe', label: 'Notepad' }, calculator: { exe: 'calc.exe', label: 'Calculator' } };
const SITES = {
  google: 'https://www.google.com/',
  youtube: 'https://www.youtube.com/',
  github: 'https://github.com/',
  vscode: 'https://code.visualstudio.com/',
};
const ALLOWED_HOSTS = new Set(Object.values(SITES).map((u) => new URL(u).hostname));

function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function formatDuration(seconds) {
  if (seconds % 3600 === 0) return `${seconds / 3600} hour(s)`;
  if (seconds % 60 === 0) return `${seconds / 60} minute(s)`;
  return `${seconds} second(s)`;
}

function createPcActions({ platform = process.platform, spawn = childProcess.spawn, openExternal, openPath, noteService, timerService, getSettings, fsp = fs, now = () => new Date() }) {
  function launchApp(exe) {
    return new Promise((resolve, reject) => {
      const child = spawn(exe, [], { shell: false, detached: true, stdio: 'ignore' });
      child.once('error', reject); // e.g. ENOENT
      child.once('spawn', () => { child.unref(); resolve(); }); // success only once the OS started it
    });
  }

  async function openFolder(folder) {
    const info = await fsp.stat(folder).catch(() => null);
    if (!info || !info.isDirectory()) return { ok: false, message: `That folder does not exist: ${folder}` };
    const error = await openPath(folder);
    return error ? { ok: false, message: `Could not open the folder: ${error}` } : { ok: true, message: `Opened ${folder}.` };
  }

  const handlers = {
    async open_app({ app }) {
      const entry = APPS[app];
      if (!entry) return { ok: false, message: 'That app is not on my allowed list.' };
      if (platform !== 'win32') return { ok: false, message: `${entry.label} can only be opened on Windows.` };
      await launchApp(entry.exe);
      return { ok: true, message: `Opened ${entry.label}.` };
    },
    async open_site({ site }) {
      const url = SITES[site];
      if (!url || !isAllowedUrl(url)) return { ok: false, message: 'That website is not on my allowed list.' };
      await openExternal(url);
      return { ok: true, message: `Opened ${url} in your browser.` };
    },
    open_notes_folder: () => openFolder(noteService.baseDir),
    open_user_folder: () => openFolder(getSettings().userFolder),
    async create_note({ text }) {
      const note = await noteService.createNote(text);
      return { ok: true, message: `Saved note: ${note.path}` };
    },
    async show_time() {
      return { ok: true, message: `It is ${now().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}.` };
    },
    async set_timer({ seconds, label }) {
      timerService.start(seconds, label);
      return { ok: true, message: `Timer set for ${formatDuration(seconds)}. I'll alert you here while NOVA stays open.` };
    },
  };

  async function run(actionName, args = {}) {
    if (!Object.hasOwn(handlers, actionName)) return { ok: false, message: 'That action is not supported.' };
    try {
      return await handlers[actionName](args);
    } catch (err) {
      return { ok: false, message: `The action failed: ${err.message}` };
    }
  }

  return { run };
}

module.exports = { createPcActions, isAllowedUrl, SITES, APPS };
