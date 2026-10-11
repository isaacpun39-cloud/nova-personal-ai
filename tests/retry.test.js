'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIService } = require('../src/main/services/aiService');
const { makeFetch, json, settings } = require('./helpers');

const gemOk = () => json(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
const msgs = [{ role: 'user', content: 'hi' }];
const sleeps = [];
const svc = (over, fetchImpl) => createAIService({
  getSettings: () => settings(over), getApiKey: () => 'sk-test', getGeminiKey: () => 'g-test', fetchImpl,
  sleep: async (ms) => { sleeps.push(ms); },
});

test('a temporary 503 is retried and then succeeds', async () => {
  let n = 0;
  const f = makeFetch(() => (++n < 3 ? json(503, { error: { message: 'busy' } }) : gemOk()));
  const r = await svc({ provider: 'gemini' }, f).send(msgs);
  assert.equal(r.text, 'ok');
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((u) => u.includes('generativelanguage')));
});

test('persistent 503 ends with a friendly BUSY error after 3 attempts', async () => {
  const f = makeFetch(() => json(503, {}));
  await assert.rejects(svc({ provider: 'gemini' }, f).send(msgs), (e) => e.code === 'BUSY' && /busy/i.test(e.message));
  assert.equal(f.calls.length, 3);
});

test('auth, rate-limit and other errors are NOT retried', async () => {
  for (const status of [401, 403, 429, 500]) {
    const f = makeFetch(() => json(status, {}));
    await assert.rejects(svc({ provider: 'gemini' }, f).send(msgs));
    assert.equal(f.calls.length, 1, `status ${status}`);
  }
});

test('retries stay on the same provider (OpenAI stays OpenAI)', async () => {
  const f = makeFetch(() => json(503, {}));
  await assert.rejects(svc({ provider: 'online' }, f).send(msgs), { code: 'BUSY' });
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((u) => u.includes('api.openai.com')));
});

test('local Ollama failures are not retried and offline never goes online', async () => {
  const f = makeFetch(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(svc({ provider: 'offline', allowOnlineFallback: true }, f).send(msgs), { code: 'OLLAMA_UNAVAILABLE' });
  assert.equal(f.calls.length, 1);
});

test('retry waits grow between attempts', async () => {
  sleeps.length = 0;
  await assert.rejects(svc({ provider: 'gemini' }, makeFetch(() => json(503, {}))).send(msgs));
  assert.deepEqual(sleeps, [2000, 4000]);
});
