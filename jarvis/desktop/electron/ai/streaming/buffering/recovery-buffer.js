'use strict';

function createRecoveryBuffer({ maxEvents = 500 } = {}) {
  const events = [];

  function push(event) {
    events.push(event);
    while (events.length > maxEvents) events.shift();
  }

  function since(sequence = 0) {
    return events.filter((event) => Number(event.sequence || 0) > Number(sequence || 0));
  }

  return {
    push,
    since,
  };
}

module.exports = { createRecoveryBuffer };
