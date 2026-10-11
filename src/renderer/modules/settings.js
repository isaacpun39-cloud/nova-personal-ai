const FIELDS = ['ollamaModel', 'ollamaBaseUrl', 'openaiModel', 'geminiModel', 'fallbackProvider', 'language', 'userFolder'];

export function createSettingsPanel({ dialog, form, messageEl, onSaved, onHistoryCleared }) {
  let current = null;

  function fill(settings) {
    current = settings;
    for (const name of FIELDS) form.elements[name].value = settings[name];
    form.elements.allowOnlineFallback.checked = settings.allowOnlineFallback;
  }

  async function load() {
    fill(await window.nova.getSettings());
    return current;
  }

  async function save(patch) {
    const result = await window.nova.setSettings(patch);
    if (result && result.kind === 'error') throw new Error(result.text);
    fill(result);
    onSaved(result);
    return result;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const patch = { allowOnlineFallback: form.elements.allowOnlineFallback.checked };
    for (const name of FIELDS) patch[name] = form.elements[name].value.trim();
    try {
      await save(patch);
      messageEl.textContent = 'Saved.';
    } catch (err) {
      messageEl.textContent = err.message;
    }
  });

  document.getElementById('closeSettings').addEventListener('click', () => dialog.close());
  document.getElementById('clearHistory').addEventListener('click', async () => {
    if (!window.confirm('Delete all saved chat history on this computer?')) return;
    await window.nova.clearHistory();
    onHistoryCleared();
    messageEl.textContent = 'History cleared.';
  });

  return { load, save, open: () => { messageEl.textContent = ''; dialog.showModal(); }, get: () => current };
}
