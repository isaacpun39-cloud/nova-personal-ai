'use strict';

function createTimerService({ onDone, setTimer = setTimeout, clearTimer = clearTimeout, maxActive = 10, maxSeconds = 86400 }) {
  const active = new Map();
  let nextId = 1;

  function start(seconds, label) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > maxSeconds) throw new Error('A timer must be between 1 second and 24 hours.');
    if (active.size >= maxActive) throw new Error(`You can have at most ${maxActive} timers at once.`);
    const id = nextId++;
    active.set(id, setTimer(() => {
      active.delete(id);
      onDone({ id, label });
    }, seconds * 1000));
    return { id };
  }

  function cancelAll() {
    for (const handle of active.values()) clearTimer(handle);
    active.clear();
  }

  return { start, cancelAll, count: () => active.size };
}

module.exports = { createTimerService };
