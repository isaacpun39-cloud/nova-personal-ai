'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIService } = require('../src/main/services/aiService');
const { validateSettingsPatch } = require('../src/main/validators');
const { makeFetch, json, settings } = require('./helpers');

const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'again' }];
const gemOk = () => json(200, { candidates: [{ content: { parts: [{ text: 'gem ' }, { text: 'answer' }] } }] });
const down = () => { throw new TypeError('fetch failed'); };
const route = (ollama, gem) => (url, init) => (url.includes('generativelanguage') ? gem(url, init) : ollama(url, init));
const svc = (over, fetchImpl, key = 'g-test') => createAIService({ getSettings: () => settings(over), getApiKey: () => 'sk-test', getGeminiKey: () => key, fetchImpl });

test('gemini mode calls only Google, sends the key in a header, and maps roles', async () => {
  let seen;
  const f = makeFetch(route(down, (url, init) => { seen = { url, init }; return gemOk(); }));
  const r = await svc({ provider: 'gemini' }, f).send(msgs);
  assert.deepEqual([r.provider, r.text], ['gemini', 'gem answer']);
  assert.ok(f.calls.every((u) => u.startsWith('https://generativelanguage.googleapis.com/')));
  assert.equal(seen.init.headers['x-goog-api-key'], 'g-test');
  assert.ok(!seen.url.includes('g-test'));
  assert.deepEqual(JSON.parse(seen.init.body).contents.map((c) => c.role), ['user', 'model', 'user']);
});

test('offline mode never contacts Gemini', async () => {
  const f = makeFetch(route(down, gemOk));
  await assert.rejects(svc({ provider: 'offline', fallbackProvider: 'gemini', allowOnlineFallback: true }, f).send(msgs), { code: 'OLLAMA_UNAVAILABLE' });
  assert.ok(f.calls.every((u) => !u.includes('generativelanguage')));
});

test('hybrid falls back to Gemini only with opt-in and a key', async () => {
  const f = makeFetch(route(down, gemOk));
  const on = { fallbackProvider: 'gemini', allowOnlineFallback: true };
  assert.equal((await svc(on, f).send(msgs)).provider, 'gemini');
  const f2 = makeFetch(route(down, gemOk));
  await assert.rejects(svc({ fallbackProvider: 'gemini', allowOnlineFallback: false }, f2).send(msgs), { code: 'OLLAMA_UNAVAILABLE' });
  assert.ok(f2.calls.every((u) => !u.includes('generativelanguage')));
  await assert.rejects(svc(on, makeFetch(route(down, gemOk)), '').send(msgs), (e) => e.code === 'NO_API_KEY' && /Gemini/.test(e.message));
});

test('gemini errors are mapped', async () => {
  const code = async (res) => svc({ provider: 'gemini' }, makeFetch(route(down, res))).send(msgs).catch((e) => e.code);
  assert.equal(await code(() => json(403, {})), 'AUTH');
  assert.equal(await code(() => json(400, { error: { message: 'API key not valid.' } })), 'AUTH');
  assert.equal(await code(() => json(429, {})), 'RATE_LIMIT');
  assert.equal(await code(() => json(500, {})), 'API');
  assert.equal(await code(() => json(200, { candidates: [] })), 'API');
  assert.equal(await code(down), 'NETWORK');
  assert.equal(await svc({ provider: 'gemini' }, makeFetch(route(down, gemOk)), '').send(msgs).catch((e) => e.code), 'NO_API_KEY');
});

test('gemini settings are validated', () => {
  assert.equal(validateSettingsPatch({ provider: 'gemini', fallbackProvider: 'gemini', geminiModel: 'gemini-2.5-flash' }).provider, 'gemini');
  assert.throws(() => validateSettingsPatch({ fallbackProvider: 'ollama' }));
  assert.throws(() => validateSettingsPatch({ geminiModel: 'bad model;' }));
});
