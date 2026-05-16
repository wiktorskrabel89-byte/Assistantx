'use strict';

function createTimeoutManager() {
  const timers = new Map();

  function schedule(key, ms, callback) {
    clear(key);
    const timer = setTimeout(() => {
      timers.delete(key);
      if (typeof callback === 'function') callback();
    }, Math.max(50, Number(ms || 0)));
    timers.set(key, timer);
    return key;
  }

  function clear(key) {
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
  }

  function clearAll() {
    for (const [key] of timers) clear(key);
  }

  return {
    schedule,
    clear,
    clearAll,
  };
}

module.exports = { createTimeoutManager };
