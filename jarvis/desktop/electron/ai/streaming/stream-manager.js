'use strict';

function createStreamManager({ bus } = {}) {
  return {
    emitText(token) { bus?.publish('stream.text', { token }); },
    emitThought(status) { bus?.publish('stream.thought', { status }); },
    emitState(state) { bus?.publish('stream.state', { state }); },
  };
}

module.exports = { createStreamManager };
