'use strict';

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60,
};
const UNIT_SECONDS = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600 };
const SITE_KEYS = { google: 'google', youtube: 'youtube', github: 'github', vscode: 'vscode', 'vs code': 'vscode', 'visual studio code': 'vscode' };

const CONFIRM_PROMPTS = { create_note: 'Create a new note in your NOVA Notes folder?' };

// Optional polite prefix + body + optional trailing punctuation, anchored to the whole message.
// Anchoring means "How do I open Calculator?" is a question, not a command.
const command = (body) => new RegExp(`^\\s*(?:(?:please|can you|could you)\\s+)*${body}\\s*[.!?]*\\s*$`, 'i');

const PATTERNS = {
  app: command('(?:open|launch|start)\\s+(?:the\\s+)?(notepad|calculator|calc)'),
  site: command('(?:open|launch|go to)\\s+(?:the\\s+)?(google|youtube|github|vs ?code|visual studio code)(?:\\s+website)?'),
  notesFolder: command('open\\s+(?:my\\s+)?nova notes(?:\\s+folder)?'),
  userFolder: command('open\\s+(?:my\\s+)?(?:user\\s+)?folder'),
  noteCreate: command('(?:create|make|take|write)\\s+(?:a\\s+)?note(?:\\s*(?::|saying|that says)\\s*(.+?))?'),
  noteColon: command('note\\s*:\\s*(.+?)'),
  time: command("(?:what(?:'s|\\s+is)?\\s+(?:the\\s+)?(?:current\\s+)?(?:time|date)(?:\\s+is\\s+it|\\s+now)?|what\\s+time\\s+is\\s+it|current\\s+(?:time|date)|today'?s\\s+date)"),
  timer: command('(?:set|start)\\s+(?:a|an)?\\s*(\\w+)[\\s-]*(second|sec|minute|min|hour)s?\\s+(?:timer|reminder)'),
  // Requests we deliberately never perform.
  dangerous: command('(?:delete|remove|erase|shut\\s?down|restart|reboot|format|uninstall|kill|execute|run\\s+(?:a\\s+)?(?:powershell|cmd|command|script|terminal))\\b.*'),
  otherOpen: command('(?:open|launch)\\s+.+'),
};

const UNSUPPORTED_MESSAGE =
  "I can't do that. I can only open Notepad, Calculator, Google, YouTube, GitHub, the VS Code website, " +
  'your folders, create notes, tell the time, and set timers.';

function parseTimer(match) {
  const rawCount = match[1].toLowerCase();
  const count = /^\d+$/.test(rawCount) ? Number.parseInt(rawCount, 10) : NUMBER_WORDS[rawCount];
  if (!count) return null;
  const unit = match[2].toLowerCase();
  return { seconds: count * UNIT_SECONDS[unit], label: `${count} ${unit.startsWith('sec') ? 'second' : unit.startsWith('min') ? 'minute' : 'hour'} timer` };
}

function action(name, args = {}) {
  return { type: 'action', action: name, args, needsConfirm: Object.hasOwn(CONFIRM_PROMPTS, name), confirmPrompt: CONFIRM_PROMPTS[name] };
}

function routeCommand(input) {
  const text = typeof input === 'string' ? input : '';
  let m;

  if ((m = PATTERNS.app.exec(text))) return action('open_app', { app: m[1].toLowerCase() === 'notepad' ? 'notepad' : 'calculator' });
  if ((m = PATTERNS.site.exec(text))) return action('open_site', { site: SITE_KEYS[m[1].toLowerCase()] });
  if (PATTERNS.notesFolder.test(text)) return action('open_notes_folder');
  if (PATTERNS.userFolder.test(text)) return action('open_user_folder');
  if ((m = PATTERNS.noteCreate.exec(text)) || (m = PATTERNS.noteColon.exec(text))) return action('create_note', { text: (m[1] || '').trim() });
  if (PATTERNS.time.test(text)) return action('show_time');
  if ((m = PATTERNS.timer.exec(text))) {
    const timer = parseTimer(m);
    if (timer) return action('set_timer', timer);
  }
  if (PATTERNS.dangerous.test(text) || PATTERNS.otherOpen.test(text)) return { type: 'unsupported', message: UNSUPPORTED_MESSAGE };
  return { type: 'question' };
}

module.exports = { routeCommand, UNSUPPORTED_MESSAGE };
