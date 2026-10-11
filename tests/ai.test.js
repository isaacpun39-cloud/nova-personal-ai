'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIService, AIError } = require('../src/main/services/aiService');
const { makeFetch, json, settings } = require('./helpers');

const msgs = [{ role: 'user', content: 'hi' }];
const ollamaOk = () => json(200, { message: { content: 'local answer' } });
const openaiOk = () => json(200, { output_text: 'online answer' });
const down = () => { throw new TypeError('fetch failed'); };
const route = (ollama, openai) => (url, init) => (url.includes('api.openai.com') ? openai(url, init) : ollama(url, init));
const svc = (over, fetchImpl, key = 'sk-test') => createAIService({ getSettings: () => settings(over), getApiKey: () => key, fetchImpl });

test('offline mode uses Ollama and labels the provider', async () => {
  const f = makeFetch(route(ollamaOk, openaiOk));
  const r = await svc({ provider: 'offline' }, f).send(msgs);
  assert.equal(r.provider, 'ollama');
  assert.equal(r.text, 'local answer');
});

test('offline-only never falls back online when Ollama is down', async () => {
  const f = makeFetch(route(down, openaiOk));
  await assert.rejects(svc({ provider: 'offline', allowOnlineFallback: true }, f).send(msgs), { code: 'OLLAMA_UNAVAILABLE' });
  assert.ok(f.calls.every((u) => !u.includes('openai.com')));
});

test('online mode uses OpenAI only', async () => {
  const f = makeFetch(route(down, openaiOk));
  const r = await svc({ provider: 'online' }, f).send(msgs);
  assert.equal(r.provider, 'openai');
  assert.ok(f.calls.every((u) => u.includes('api.openai.com')));
});

test('hybrid prefers the local model', async () => {
  const f = makeFetch(route(ollamaOk, openaiOk));
  assert.equal((await svc({}, f).send(msgs)).provider, 'ollama');
  assert.ok(f.calls.every((u) => !u.includes('openai.com')));
});

test('hybrid does NOT silently send online without opt-in', async () => {
  const f = makeFetch(route(down, openaiOk));
  await assert.rejects(svc({ allowOnlineFallback: false }, f).send(msgs), (e) => e.code === 'OLLAMA_UNAVAILABLE' && /nothing was sent online/.test(e.message));
  assert.ok(f.calls.every((u) => !u.includes('openai.com')));
});

test('hybrid falls back online with opt-in and key, and reports openai', async () => {
  const f = makeFetch(route(down, openaiOk));
  const r = await svc({ allowOnlineFallback: true }, f).send(msgs);
  assert.equal(r.provider, 'openai');
});

test('hybrid fallback without an API key reports NO_API_KEY', async () => {
  const f = makeFetch(route(down, openaiOk));
  await assert.rejects(svc({ allowOnlineFallback: true }, f, '').send(msgs), { code: 'NO_API_KEY' });
});

test('missing local model gives a pull hint (HTTP 404)', async () => {
  const f = makeFetch(route(() => json(404, { error: 'model not found' }), openaiOk));
  await assert.rejects(svc({ provider: 'offline' }, f).send(msgs), (e) => e.code === 'MODEL_MISSING' && /ollama pull llama3.2:3b/.test(e.message));
});

test('OpenAI error codes are mapped', async () => {
  for (const [status, code] of [[401, 'AUTH'], [429, 'RATE_LIMIT'], [500, 'API']]) {
    const f = makeFetch(route(down, () => json(status, { error: { message: 'x' } })));
    await assert.rejects(svc({ provider: 'online' }, f).send(msgs), { code });
  }
  await assert.rejects(svc({ provider: 'online' }, makeFetch(route(down, down))).send(msgs), { code: 'NETWORK' });
});

test('OpenAI output array is parsed when output_text is absent', async () => {
  const body = { output: [{ content: [{ type: 'output_text', text: 'part A ' }, { type: 'output_text', text: 'part B' }] }] };
  const r = await svc({ provider: 'online' }, makeFetch(route(down, () => json(200, body)))).send(msgs);
  assert.equal(r.text, 'part A part B');
});

test('status reports ollama ready / model missing / unavailable', async () => {
  const tags = (names) => makeFetch(route(() => json(200, { models: names.map((name) => ({ name })) }), openaiOk));
  assert.equal((await svc({}, tags(['llama3.2:3b'])).status()).ollama.state, 'ready');
  assert.equal((await svc({}, tags(['other:1b'])).status()).ollama.state, 'model-missing');
  assert.equal((await svc({}, makeFetch(route(down, openaiOk))).status()).ollama.state, 'unavailable');
});

test('AIError carries a code', () => assert.equal(new AIError('X', 'm').code, 'X'));
