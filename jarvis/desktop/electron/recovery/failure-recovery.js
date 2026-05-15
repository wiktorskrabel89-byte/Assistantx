'use strict';

async function recoverFailure({ error, strategy }) {
  if (typeof strategy === 'function') return strategy(error);
  return { recovered: false, reason: 'no-strategy' };
}

module.exports = { recoverFailure };
