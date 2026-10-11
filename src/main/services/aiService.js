'use strict';

class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Only these local failures may trigger the (opt-in) online fallback.
const LOCAL_FALLBACK_CODES = new Set(['OLLAMA_UNAVAILABLE', 'MODEL_MISSING', 'TIMEOUT']);
const SYSTEM_PROMPT =
  'You are NOVA, a concise, helpful personal assistant. You cannot run commands or touch the PC yourself; ' +
  'the app performs a fixed list of actions on its own. Never claim you performed an action.';

const BUSY_STATUSES = new Set([502, 503, 504]);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries only temporary "busy" errors, against the same provider (never a different one).
async function withRetry(fn, { retries, delayMs, sleep }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof AIError) || err.code !== 'BUSY' || attempt >= retries) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

const isTimeout = (err) => err && (err.name === 'TimeoutError' || err.name === 'AbortError');

function createOllamaProvider({ baseUrl, model, fetchImpl = fetch, timeoutMs = 120000 }) {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(route, init, ms) {
    try {
      return await fetchImpl(base + route, { ...init, signal: AbortSignal.timeout(ms) });
    } catch (err) {
      if (isTimeout(err)) throw new AIError('TIMEOUT', 'The local model took too long to respond.');
      throw new AIError('OLLAMA_UNAVAILABLE', `Cannot reach Ollama at ${base}. Start the Ollama app (or run "ollama serve").`);
    }
  }

  const missingModel = () => new AIError('MODEL_MISSING', `Model "${model}" is not installed. Run: ollama pull ${model}`);

  async function checkAvailability() {
    const res = await call('/api/tags', { method: 'GET' }, 3000);
    if (!res.ok) throw new AIError('OLLAMA_UNAVAILABLE', `Ollama answered with HTTP ${res.status}.`);
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name);
    const found = names.includes(model) || (!model.includes(':') && names.includes(`${model}:latest`));
    if (!found) throw missingModel();
    return true;
  }

  async function chat(messages) {
    const body = { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], stream: false };
    const res = await call(
      '/api/chat',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      timeoutMs,
    );
    if (res.status === 404) throw missingModel();
    if (!res.ok) throw new AIError('API', `Ollama returned HTTP ${res.status}.`);
    const data = await res.json();
    const text = data && data.message && data.message.content;
    if (typeof text !== 'string' || !text.trim()) throw new AIError('API', 'Ollama returned an empty answer.');
    return { text, provider: 'ollama', model };
  }

  return { name: 'ollama', chat, checkAvailability };
}

function extractOpenAIText(data) {
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const parts = (Array.isArray(data.output) ? data.output : [])
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text);
  return parts.join('');
}

function createOpenAIProvider({ apiKey, model, fetchImpl = fetch, timeoutMs = 60000 }) {
  async function chat(messages) {
    if (!apiKey) throw new AIError('NO_API_KEY', 'No OpenAI API key is set. Add OPENAI_API_KEY to your .env file.');
    let res;
    try {
      res = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, instructions: SYSTEM_PROMPT, input: messages, store: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) throw new AIError('TIMEOUT', 'The online request timed out.');
      throw new AIError('NETWORK', 'Could not reach the OpenAI API. Check your internet connection.');
    }
    if (res.status === 401) throw new AIError('AUTH', 'OpenAI rejected the API key. Check OPENAI_API_KEY.');
    if (res.status === 429) throw new AIError('RATE_LIMIT', 'OpenAI rate limit or quota reached. Try again later or check your billing.');
    if (BUSY_STATUSES.has(res.status)) throw new AIError('BUSY', `OpenAI is busy right now (HTTP ${res.status}). Please try again in a moment.`);
    if (!res.ok) {
      let detail = '';
      try {
        detail = String((await res.json()).error?.message || '').slice(0, 200);
      } catch {
        /* ignore unreadable error bodies */
      }
      throw new AIError('API', `OpenAI returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const text = extractOpenAIText(await res.json());
    if (!text.trim()) throw new AIError('API', 'OpenAI returned an empty answer.');
    return { text, provider: 'openai', model };
  }

  return { name: 'openai', chat };
}

function createGeminiProvider({ apiKey, model, fetchImpl = fetch, timeoutMs = 60000 }) {
  async function chat(messages) {
    if (!apiKey) throw new AIError('NO_API_KEY', 'No Gemini API key is set. Add GEMINI_API_KEY to your .env file.');
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    };
    let res;
    try {
      res = await fetchImpl(`${GEMINI_URL}${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) throw new AIError('TIMEOUT', 'The Gemini request timed out.');
      throw new AIError('NETWORK', 'Could not reach the Gemini API. Check your internet connection.');
    }
    if (res.status === 401 || res.status === 403) throw new AIError('AUTH', 'Gemini rejected the API key. Check GEMINI_API_KEY.');
    if (res.status === 429) throw new AIError('RATE_LIMIT', 'Gemini rate limit or quota reached. Try again later.');
    if (BUSY_STATUSES.has(res.status)) throw new AIError('BUSY', `Gemini is busy right now (HTTP ${res.status}). Please try again in a moment.`);
    if (!res.ok) {
      let detail = '';
      try {
        detail = String((await res.json()).error?.message || '').slice(0, 200);
      } catch {
        /* ignore unreadable error bodies */
      }
      if (res.status === 400 && /api key/i.test(detail)) throw new AIError('AUTH', 'Gemini rejected the API key. Check GEMINI_API_KEY.');
      throw new AIError('API', `Gemini returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('') : '';
    if (!text.trim()) throw new AIError('API', 'Gemini returned no answer (it may have been blocked by a safety filter).');
    return { text, provider: 'gemini', model };
  }
  return { name: 'gemini', chat };
}

function createAIService({ getSettings, getApiKey, getGeminiKey = () => '', fetchImpl = fetch, sleep = defaultSleep, retries = 2, retryDelayMs = 2000 }) {
  const retry = (fn) => withRetry(fn, { retries, delayMs: retryDelayMs, sleep });
  const local = () => {
    const s = getSettings();
    return createOllamaProvider({ baseUrl: s.ollamaBaseUrl, model: s.ollamaModel, fetchImpl });
  };
  const online = () => createOpenAIProvider({ apiKey: getApiKey(), model: getSettings().openaiModel, fetchImpl });
  const gemini = () => createGeminiProvider({ apiKey: getGeminiKey(), model: getSettings().geminiModel, fetchImpl });

  async function send(messages) {
    const settings = getSettings();
    if (settings.provider === 'offline') return local().chat(messages);
    if (settings.provider === 'online') return retry(() => online().chat(messages));
    if (settings.provider === 'gemini') return retry(() => gemini().chat(messages));

    try {
      return await local().chat(messages);
    } catch (err) {
      if (!(err instanceof AIError) || !LOCAL_FALLBACK_CODES.has(err.code)) throw err;
      if (!settings.allowOnlineFallback) {
        throw new AIError(err.code, `${err.message} Online fallback is turned off in Settings, so nothing was sent online.`);
      }
      const useGemini = settings.fallbackProvider === 'gemini';
      if (!(useGemini ? getGeminiKey() : getApiKey())) {
        throw new AIError('NO_API_KEY', `${err.message} No ${useGemini ? 'Gemini' : 'OpenAI'} API key is configured for fallback.`);
      }
      return retry(() => (useGemini ? gemini() : online()).chat(messages));
    }
  }

  async function status() {
    const s = getSettings();
    const result = { provider: s.provider, ollama: { state: 'skipped', message: '' }, openai: { configured: Boolean(getApiKey()) }, gemini: { configured: Boolean(getGeminiKey()) } };
    if (s.provider === 'online' || s.provider === 'gemini') return result;
    try {
      await local().checkAvailability();
      result.ollama = { state: 'ready', message: `Local model "${s.ollamaModel}" is ready.` };
    } catch (err) {
      const state = err.code === 'MODEL_MISSING' ? 'model-missing' : 'unavailable';
      result.ollama = { state, message: err.message };
    }
    return result;
  }

  return { send, status };
}

module.exports = { AIError, createAIService, createOllamaProvider, createOpenAIProvider, createGeminiProvider, LOCAL_FALLBACK_CODES };
