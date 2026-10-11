'use strict';
const { validateChatPayload, validateSettingsPatch, ValidationError } = require('./validators');
const { routeCommand } = require('./services/commandRouter');
const { AIError } = require('./services/aiService');

const CONTEXT_MESSAGES = 20;

function createHandlers({ settingsStore, historyStore, aiService, pcActions, route = routeCommand }) {
  async function chat(payload) {
    const { text, confirmed } = validateChatPayload(payload);
    const decision = route(text);

    if (decision.type === 'unsupported') return { kind: 'unsupported', text: decision.message };

    if (decision.type === 'action') {
      if (decision.needsConfirm && !confirmed) return { kind: 'confirm', text: decision.confirmPrompt };
      const result = await pcActions.run(decision.action, decision.args);
      historyStore.append(
        { role: 'user', content: text, local: true },
        { role: 'assistant', content: result.message, provider: 'nova-action', local: true },
      );
      return { kind: 'action', ok: result.ok, text: result.message };
    }

    // Action chatter stays out of the context sent to a model.
    const context = historyStore.get().filter((m) => !m.local).slice(-CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content }));
    const answer = await aiService.send([...context, { role: 'user', content: text }]);
    historyStore.append({ role: 'user', content: text }, { role: 'assistant', content: answer.text, provider: answer.provider, model: answer.model });
    return { kind: 'ai', text: answer.text, provider: answer.provider, model: answer.model };
  }

  return {
    chat,
    status: () => aiService.status(),
    getSettings: () => settingsStore.get(),
    setSettings: (patch) => settingsStore.update(validateSettingsPatch(patch)),
    getHistory: () => historyStore.get(),
    clearHistory: () => { historyStore.clear(); return { ok: true }; },
  };
}

function toErrorResult(err) {
  if (err instanceof ValidationError) return { kind: 'error', text: err.message };
  if (err instanceof AIError) return { kind: 'error', code: err.code, text: err.message };
  console.error('Unexpected error:', err && err.name); // never log message content or keys
  return { kind: 'error', text: 'Something went wrong. Please try again.' };
}

function registerIpc({ ipcMain, handlers, isTrustedSender }) {
  const wrap = (fn) => async (event, payload) => {
    if (!isTrustedSender(event)) return { kind: 'error', text: 'Untrusted sender.' };
    try {
      return await fn(payload);
    } catch (err) {
      return toErrorResult(err);
    }
  };
  ipcMain.handle('nova:chat', wrap(handlers.chat));
  ipcMain.handle('nova:status', wrap(handlers.status));
  ipcMain.handle('nova:settings:get', wrap(handlers.getSettings));
  ipcMain.handle('nova:settings:set', wrap(handlers.setSettings));
  ipcMain.handle('nova:history:get', wrap(handlers.getHistory));
  ipcMain.handle('nova:history:clear', wrap(handlers.clearHistory));
}

module.exports = { createHandlers, registerIpc, toErrorResult };
