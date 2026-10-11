// Renders messages. Everything goes through textContent, so model output can never become HTML.
export function createChat(listEl) {
  function clearEmpty() {
    const empty = listEl.querySelector('.empty');
    if (empty) empty.remove();
  }

  function showEmpty() {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Hi, I\'m NOVA. Ask me a question, or try "open Calculator", "what time is it", or "set a five-minute timer".';
    listEl.replaceChildren(div);
  }

  function add(role, text, { label = '', error = false, pending = false } = {}) {
    clearEmpty();
    const bubble = document.createElement('div');
    bubble.className = `msg ${role}${error ? ' error' : ''}${pending ? ' pending' : ''}`;
    const body = document.createElement('span');
    body.textContent = text;
    bubble.append(body);
    if (label) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = label;
      bubble.append(meta);
    }
    listEl.append(bubble);
    listEl.scrollTop = listEl.scrollHeight;
    return bubble;
  }

  return { add, showEmpty, clear: showEmpty };
}

export function providerLabel(provider, model) {
  if (provider === 'ollama') return `Local · Ollama · ${model}`;
  if (provider === 'openai') return `Online · OpenAI · ${model}`;
  if (provider === 'gemini') return `Online · Gemini · ${model}`;
  if (provider === 'nova-action') return 'NOVA action';
  return '';
}
