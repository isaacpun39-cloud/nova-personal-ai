'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const { createPcActions, isAllowedUrl, SITES } = require('../src/main/services/pcActions');
const { createNoteService, resolveInside } = require('../src/main/services/noteService');
const { createTimerService } = require('../src/main/services/timerService');

function fakeSpawn(outcome) {
  const calls = [];
  const spawn = (exe, args, opts) => {
    calls.push({ exe, args, opts });
    const child = new EventEmitter();
    child.unref = () => {};
    setImmediate(() => (outcome === 'ok' ? child.emit('spawn') : child.emit('error', new Error('ENOENT'))));
    return child;
  };
  spawn.calls = calls;
  return spawn;
}
const deps = (over = {}) => ({ platform: 'win32', spawn: fakeSpawn('ok'), openExternal: async () => {}, openPath: async () => '', noteService: { baseDir: os.tmpdir() }, timerService: { start() {} }, getSettings: () => ({ userFolder: os.tmpdir() }), ...over });

test('apps launch with an argument array and no shell', async () => {
  const spawn = fakeSpawn('ok');
  const r = await createPcActions(deps({ spawn })).run('open_app', { app: 'calculator' });
  assert.equal(r.ok, true);
  assert.deepEqual(spawn.calls[0].args, []);
  assert.equal(spawn.calls[0].opts.shell, false);
  assert.equal(spawn.calls[0].exe, 'calc.exe');
});

test('launch failure is reported, not claimed as success', async () => {
  const r = await createPcActions(deps({ spawn: fakeSpawn('fail') })).run('open_app', { app: 'notepad' });
  assert.equal(r.ok, false);
});

test('unknown apps and actions are rejected; non-Windows is explained', async () => {
  const pc = createPcActions(deps());
  assert.equal((await pc.run('open_app', { app: 'cmd' })).ok, false);
  assert.equal((await pc.run('run_shell', { cmd: 'dir' })).ok, false);
  assert.equal((await createPcActions(deps({ platform: 'linux' })).run('open_app', { app: 'notepad' })).ok, false);
});

test('only allowlisted https sites are accepted', async () => {
  for (const url of Object.values(SITES)) assert.ok(isAllowedUrl(url));
  for (const bad of ['http://github.com/', 'https://evil.com/', 'https://github.com.evil.com/', 'https://user:pw@github.com/', 'javascript:alert(1)', 'file:///c:/x']) assert.equal(isAllowedUrl(bad), false, bad);
  const opened = [];
  const pc = createPcActions(deps({ openExternal: async (u) => opened.push(u) }));
  assert.equal((await pc.run('open_site', { site: 'github' })).ok, true);
  assert.equal((await pc.run('open_site', { site: 'evil' })).ok, false);
  assert.deepEqual(opened, ['https://github.com/']);
});

test('opening a missing folder fails honestly', async () => {
  const pc = createPcActions(deps({ getSettings: () => ({ userFolder: path.join(os.tmpdir(), 'nova-does-not-exist-xyz') }) }));
  assert.equal((await pc.run('open_user_folder')).ok, false);
});

test('note paths cannot escape the notes folder', () => {
  const base = path.join(os.tmpdir(), 'notes');
  assert.throws(() => resolveInside(base, '../evil.txt'));
  assert.throws(() => resolveInside(base, path.resolve(os.tmpdir(), 'evil.txt')));
  assert.throws(() => resolveInside(base, '..'));
  assert.ok(resolveInside(base, 'ok.txt').startsWith(path.resolve(base)));
});

test('notes are timestamped, never overwritten, and verified', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nova-'));
  const fixed = new Date(2026, 0, 2, 3, 4, 5);
  const svc = createNoteService({ baseDir: path.join(dir, 'NOVA Notes'), now: () => fixed });
  const a = await svc.createNote('first');
  const b = await svc.createNote('second');
  assert.equal(a.name, 'note-2026-01-02_03-04-05.txt');
  assert.notEqual(a.name, b.name);
  assert.equal((await fsp.readFile(a.path, 'utf8')).trim(), 'first');
  await assert.rejects(svc.createNote('   '));
  await fsp.rm(dir, { recursive: true, force: true });
});

test('timers validate duration and fire via callback', () => {
  const fired = [];
  let cb;
  const t = createTimerService({ onDone: (x) => fired.push(x), setTimer: (fn) => { cb = fn; return 1; }, clearTimer: () => {} });
  assert.throws(() => t.start(0, 'x'));
  assert.throws(() => t.start(86401, 'x'));
  t.start(60, '1 minute timer');
  assert.equal(t.count(), 1);
  cb();
  assert.deepEqual(fired[0].label, '1 minute timer');
  assert.equal(t.count(), 0);
});
