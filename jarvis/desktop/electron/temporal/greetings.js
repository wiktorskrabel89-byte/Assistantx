'use strict';

const { buildTemporalContext } = require('./context');

function buildContextualGreeting(options = {}) {
  const persona = String(options.persona || 'neutral').toLowerCase();
  const context = buildTemporalContext(options);
  if (context.period === 'morning') {
    if (persona === 'jarvis') return `Good morning, sir. Current time is ${context.localTime}.`;
    return `Good morning. Current time is ${context.localTime}.`;
  }
  if (context.period === 'afternoon') {
    if (persona === 'jarvis') return 'Good afternoon, sir.';
    return 'Good afternoon.';
  }
  if (context.period === 'evening') {
    if (persona === 'jarvis') return 'Good evening, sir.';
    return 'Good evening.';
  }
  if (persona === 'jarvis') return 'It is getting late, sir.';
  return 'It is getting late.';
}

module.exports = {
  buildContextualGreeting,
};

