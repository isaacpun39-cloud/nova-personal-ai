'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createHandlers, registerIpc } = require('../src/main/ipc');
const { validateSettingsPatch, validateChatPayload, isLocalUrl } = require('../src/main/validators');
const { createSettingsStore, buildDefaults } = require('../src/main/config');
const { createHistoryStore } = require('../src/main/historyStore');

function setup({ ai, pc } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ipc-'));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, 's.json'), defaults: buildDefaults({}, dir) });
  const historyStore = createHistoryStore({ filePath: path.join(dir, 'h.json') });
  const aiService = ai || { send: async () => ({ text: 'hello', provider: 'ollama', model: 'm' }), status: async () => ({}) };
  const pcActions = pc || { run: async () => ({ ok: true, message: 'done' }) };
  return { dir, settingsStore, historyStore, handlers: createHandlers({ settingsStore, historyStore, aiService, pcActions }) };
}

test('chat payload validation', () => {
  for (const bad of [null, 'x', [], {}, { text: 5 }, { text: '   ' }, { text: 'a'.repeat(4001) }, { text: 'hi', confirmed: 'yes' }]) assert.throws(() => validateChatPayload(bad));
  assert.deepEqual(validateChatPayload({ text: ' hi ' }), { text: 'hi', confirmed: false });
});

test('settings validation rejects unknown keys and unsafe values', () => {
  for (const bad of [{ apiKey: 'sk-x' }, { provider: 'cloud' }, { ollamaBaseUrl: 'http://evil.com' }, { ollamaModel: 'a b; rm -rf' }, { userFolder: '..\\x' }, { language: 'english!' }, { allowOnlineFallback: 'true' }, []]) {
    assert.throws(() => validateSettingsPatch(bad), JSON.stringify(bad));
  }
  assert.equal(validateSettingsPatch({ ollamaBaseUrl: 'http://localhost:11434/' }).ollamaBaseUrl, 'http://localhost:11434');
  assert.ok(isLocalUrl('http://127.0.0.1:11434'));
  assert.equal(isLocalUrl('http://192.168.1.5:11434'), false);
});

test('chat routes actions, asks for confirmation, and keeps action text out of AI context', async () => {
  let seen;
  const { handlers, historyStore } = setup({ ai: { send: async (m) => { seen = m; return { text: 'ok', provider: 'ollama', model: 'm' }; } } });
  assert.equal((await handlers.chat({ text: 'create a note: hi' })).kind, 'confirm');
  assert.equal((await handlers.chat({ text: 'create a note: hi', confirmed: true })).kind, 'action');
  assert.equal((await handlers.chat({ text: 'delete everything' })).kind, 'unsupported');
  await handlers.chat({ text: 'What is a closure?' });
  assert.deepEqual(seen, [{ role: 'user', content: 'What is a closure?' }]);
  assert.ok(historyStore.get().length >= 4);
});

test('AI answers carry provider and are saved locally; history can be cleared', async () => {
  const { handlers } = setup();
  const r = await handlers.chat({ text: 'hello?' });
  assert.equal(r.provider, 'ollama');
  assert.equal(handlers.getHistory().length, 2);
  handlers.clearHistory();
  assert.equal(handlers.getHistory().length, 0);
});

test('failed AI calls do not store a dangling user message', async () => {
  const { handlers } = setup({ ai: { send: async () => { throw new Error('boom'); } } });
  await assert.rejects(handlers.chat({ text: 'hi' }));
  assert.equal(handlers.getHistory().length, 0);
});

test('IPC rejects untrusted senders and returns safe errors', async () => {
  const { handlers } = setup();
  const registered = {};
  registerIpc({ ipcMain: { handle: (ch, fn) => { registered[ch] = fn; } }, handlers, isTrustedSender: (e) => e.trusted === true });
  assert.equal((await registered['nova:chat']({ trusted: false }, { text: 'hi' })).kind, 'error');
  assert.equal((await registered['nova:chat']({ trusted: true }, { text: 5 })).kind, 'error');
  const res = await registered['nova:settings:set']({ trusted: true }, { apiKey: 'sk-secret' });
  assert.equal(res.kind, 'error');
  assert.ok(!JSON.stringify(res).includes('sk-secret'));
});

test('settings persist and the API key is never part of settings', () => {
  const { settingsStore, dir } = setup();
  settingsStore.update({ provider: 'offline' });
  const again = createSettingsStore({ filePath: path.join(dir, 's.json'), defaults: buildDefaults({}, dir) });
  assert.equal(again.get().provider, 'offline');
  assert.ok(!('openaiApiKey' in again.get()) && !JSON.stringify(again.get()).includes('sk-'));
});
