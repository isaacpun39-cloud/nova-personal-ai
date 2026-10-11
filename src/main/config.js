'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateSettingsPatch, isLocalUrl } = require('./validators');

function buildDefaults(env, documentsPath) {
  const defaults = {
    provider: 'hybrid',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2:3b',
    openaiModel: 'gpt-4.1-mini',
    geminiModel: 'gemini-2.5-flash', // example value: check Google's docs for current names
    fallbackProvider: 'openai',
    allowOnlineFallback: false, // online fallback needs explicit opt-in
    speakResponses: true,
    language: 'en-US',
    userFolder: documentsPath,
  };
  if (env.OLLAMA_BASE_URL && isLocalUrl(env.OLLAMA_BASE_URL)) defaults.ollamaBaseUrl = env.OLLAMA_BASE_URL.replace(/\/+$/, '');
  if (env.OLLAMA_MODEL) defaults.ollamaModel = env.OLLAMA_MODEL;
  if (env.OPENAI_MODEL) defaults.openaiModel = env.OPENAI_MODEL;
  if (env.GEMINI_MODEL) defaults.geminiModel = env.GEMINI_MODEL;
  try {
    return { ...defaults, ...validateSettingsPatch({ ollamaModel: defaults.ollamaModel, openaiModel: defaults.openaiModel, geminiModel: defaults.geminiModel }) };
  } catch {
    return defaults;
  }
}

function createSettingsStore({ filePath, defaults, fsImpl = fs }) {
  let cache = null;

  function load() {
    if (cache) return cache;
    let saved = {};
    try {
      saved = validateSettingsPatch(JSON.parse(fsImpl.readFileSync(filePath, 'utf8')));
    } catch {
      saved = {};
    }
    cache = { ...defaults, ...saved };
    return cache;
  }

  return {
    get: () => ({ ...load() }),
    update(patch) {
      cache = { ...load(), ...patch };
      fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
      fsImpl.writeFileSync(filePath, JSON.stringify(cache, null, 2));
      return { ...cache };
    },
  };
}

// The API key only ever comes from the environment; it is never saved or sent to the UI.
const getApiKey = (env = process.env) => (env.OPENAI_API_KEY || '').trim();
const getGeminiKey = (env = process.env) => (env.GEMINI_API_KEY || '').trim();

module.exports = { buildDefaults, createSettingsStore, getApiKey, getGeminiKey };
