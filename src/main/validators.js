'use strict';
const path = require('node:path');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const PROVIDERS = ['offline', 'online', 'gemini', 'hybrid'];
const FALLBACKS = ['openai', 'gemini'];
const MODEL_RE = /^[A-Za-z0-9._:\-/]{1,100}$/;
const LANGUAGE_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// The offline model URL must stay on this machine, so "offline" can never leak prompts.
function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && LOCAL_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

const settingRules = {
  provider: (v) => {
    if (!PROVIDERS.includes(v)) throw new ValidationError('provider must be offline, online, gemini, or hybrid.');
    return v;
  },
  ollamaModel: (v) => {
    if (typeof v !== 'string' || !MODEL_RE.test(v)) throw new ValidationError('Invalid Ollama model name.');
    return v;
  },
  ollamaBaseUrl: (v) => {
    if (typeof v !== 'string' || !isLocalUrl(v)) {
      throw new ValidationError('Ollama URL must be http(s) on localhost or 127.0.0.1.');
    }
    return v.replace(/\/+$/, '');
  },
  openaiModel: (v) => {
    if (typeof v !== 'string' || !MODEL_RE.test(v)) throw new ValidationError('Invalid OpenAI model name.');
    return v;
  },
  geminiModel: (v) => {
    if (typeof v !== 'string' || !MODEL_RE.test(v)) throw new ValidationError('Invalid Gemini model name.');
    return v;
  },
  fallbackProvider: (v) => {
    if (!FALLBACKS.includes(v)) throw new ValidationError('fallbackProvider must be openai or gemini.');
    return v;
  },
  allowOnlineFallback: (v) => {
    if (typeof v !== 'boolean') throw new ValidationError('allowOnlineFallback must be true or false.');
    return v;
  },
  speakResponses: (v) => {
    if (typeof v !== 'boolean') throw new ValidationError('speakResponses must be true or false.');
    return v;
  },
  language: (v) => {
    if (typeof v !== 'string' || !LANGUAGE_RE.test(v)) throw new ValidationError('Invalid language code (example: en-US).');
    return v;
  },
  userFolder: (v) => {
    if (typeof v !== 'string' || v.length > 260 || v.includes('\0') || !path.isAbsolute(v)) {
      throw new ValidationError('Folder must be an absolute path.');
    }
    return v;
  },
};

function validateSettingsPatch(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Settings must be an object.');
  }
  const clean = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(settingRules, key)) throw new ValidationError(`Unknown setting: ${key}`);
    clean[key] = settingRules[key](value);
  }
  return clean;
}

function validateChatPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Invalid message.');
  }
  const { text, confirmed = false } = payload;
  if (typeof text !== 'string') throw new ValidationError('Message text must be a string.');
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 4000) throw new ValidationError('Message must be 1-4000 characters.');
  if (typeof confirmed !== 'boolean') throw new ValidationError('confirmed must be true or false.');
  return { text: trimmed, confirmed };
}

module.exports = { ValidationError, validateSettingsPatch, validateChatPayload, isLocalUrl, PROVIDERS };
