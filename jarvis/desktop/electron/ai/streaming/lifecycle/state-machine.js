'use strict';

const ALLOWED = {
  created: new Set(['active', 'failed', 'interrupted']),
  active: new Set(['recovering', 'interrupted', 'completed', 'failed']),
  recovering: new Set(['active', 'failed', 'interrupted']),
  interrupted: new Set(['failed', 'completed']),
  completed: new Set(),
  failed: new Set(),
};

function canTransition(from, to) {
  return Boolean(ALLOWED[from]?.has(to));
}

function transition(session, nextState) {
  const from = session?.state || 'created';
  if (!canTransition(from, nextState)) {
    return {
      ok: false,
      reason: `invalid-transition:${from}->${nextState}`,
    };
  }
  return {
    ok: true,
    state: nextState,
  };
}

module.exports = {
  canTransition,
  transition,
};
