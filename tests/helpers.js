'use strict';
// Fake fetch that records every URL and answers from a routing function.
function makeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init);
  };
  fn.calls = calls;
  return fn;
}
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const settings = (over = {}) => ({
  provider: 'hybrid', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'llama3.2:3b',
  openaiModel: 'gpt-4.1-mini', geminiModel: 'gemini-2.5-flash', fallbackProvider: 'openai', allowOnlineFallback: false, ...over,
});
module.exports = { makeFetch, json, settings };
