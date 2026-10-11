'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_NOTE_LENGTH = 5000;

// Resolve a file name inside baseDir and refuse anything that escapes it (../, absolute paths, other drives).
function resolveInside(baseDir, name) {
  const base = path.resolve(baseDir);
  const full = path.resolve(base, name);
  const rel = path.relative(base, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside the notes folder.');
  return full;
}

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function createNoteService({ baseDir, fsp = fs, now = () => new Date() }) {
  async function createNote(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error("Tell me what the note should say, e.g. 'create a note: buy milk'.");
    if (text.length > MAX_NOTE_LENGTH) throw new Error(`Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
    await fsp.mkdir(baseDir, { recursive: true });
    const stamp = timestamp(now());
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const name = `note-${stamp}${attempt ? `-${attempt}` : ''}.txt`;
      const fullPath = resolveInside(baseDir, name);
      try {
        await fsp.writeFile(fullPath, `${text.trim()}\n`, { flag: 'wx', encoding: 'utf8' }); // 'wx' never overwrites
      } catch (err) {
        if (err.code === 'EEXIST') continue;
        throw err;
      }
      const info = await fsp.stat(fullPath);
      if (!info.isFile() || info.size === 0) throw new Error('The note file could not be verified.');
      return { path: fullPath, name };
    }
    throw new Error('Could not choose a unique note file name.');
  }
  return { createNote, baseDir };
}

module.exports = { createNoteService, resolveInside, MAX_NOTE_LENGTH };
