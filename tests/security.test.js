'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('renderer never uses innerHTML/eval-style APIs (model output stays text)', () => {
  for (const file of ['renderer.js', 'modules/chat.js', 'modules/voice.js', 'modules/settings.js']) {
    const src = read('src', 'renderer', file);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(src), file);
  }
  assert.match(read('src', 'renderer', 'modules', 'chat.js'), /textContent/);
});

test('window is created with the secure Electron settings', () => {
  const main = read('src', 'main', 'main.js');
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
});

test('CSP blocks inline scripts and remote connections', () => {
  const html = read('src', 'renderer', 'index.html');
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html));
});

test('preload exposes named functions only', () => {
  const pre = read('src', 'preload', 'preload.js');
  assert.ok(!/exposeInMainWorld\('nova',\s*ipcRenderer/.test(pre));
  assert.ok(!/process\.env|require\('node:(fs|child_process)'\)/.test(pre));
});

test('secrets are ignored by git and not hardcoded', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('.env.example'), /^OPENAI_API_KEY=$/m);
  for (const f of ['aiService.js', 'pcActions.js']) assert.ok(!/sk-[A-Za-z0-9]{10,}/.test(read('src', 'main', 'services', f)));
});

test('no shell execution or exec APIs in main code', () => {
  for (const f of ['services/pcActions.js', 'main.js', 'ipc.js']) {
    const src = read('src', 'main', f);
    assert.ok(!/\bexec(Sync)?\(|shell:\s*true|powershell|cmd\.exe/i.test(src), f);
  }
});
