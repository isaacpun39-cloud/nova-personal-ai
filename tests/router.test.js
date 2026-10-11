'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { routeCommand } = require('../src/main/services/commandRouter');

test('recognizes allowlisted actions', () => {
  assert.deepEqual(routeCommand('Open Calculator.').args, { app: 'calculator' });
  assert.equal(routeCommand('open notepad').action, 'open_app');
  assert.deepEqual(routeCommand('Open GitHub').args, { site: 'github' });
  assert.deepEqual(routeCommand('open the visual studio code website').args, { site: 'vscode' });
  assert.equal(routeCommand("What's the time?").action, 'show_time');
  assert.equal(routeCommand('What time is it').action, 'show_time');
  assert.equal(routeCommand('open my folder').action, 'open_user_folder');
});

test('timers parse digits and words', () => {
  assert.deepEqual(routeCommand('Set a five-minute timer.').args.seconds, 300);
  assert.equal(routeCommand('set a 10 minute timer').args.seconds, 600);
  assert.equal(routeCommand('start a 30 second timer').args.seconds, 30);
});

test('notes need confirmation and carry their text', () => {
  const r = routeCommand('create a note: buy milk');
  assert.equal(r.action, 'create_note');
  assert.equal(r.args.text, 'buy milk');
  assert.equal(r.needsConfirm, true);
  assert.equal(routeCommand('Create a note').args.text, '');
});

test('conversations about actions are questions, not commands', () => {
  for (const q of ['How do I open Calculator in Python?', 'Why does my timer not work?', 'Explain this JavaScript error: TypeError', 'Tell me about GitHub']) {
    assert.equal(routeCommand(q).type, 'question', q);
  }
});

test('unsupported and dangerous commands are refused', () => {
  for (const c of ['delete my files', 'run powershell Get-Process', 'open regedit', 'shutdown the computer', 'format the disk']) {
    assert.equal(routeCommand(c).type, 'unsupported', c);
  }
});

test('non-string input is a harmless question', () => assert.equal(routeCommand(undefined).type, 'question'));
