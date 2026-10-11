'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 200;

// Chat history stays on this computer in a JSON file. Nothing here is uploaded.
function createHistoryStore({ filePath, fsImpl = fs }) {
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      cache = Array.isArray(data) ? data : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function save() {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    fsImpl.writeFileSync(filePath, JSON.stringify(cache));
  }

  return {
    get: () => load().map((entry) => ({ ...entry })),
    append(...entries) {
      cache = [...load(), ...entries].slice(-MAX_ENTRIES);
      save();
    },
    clear() {
      cache = [];
      save();
    },
  };
}

module.exports = { createHistoryStore };
