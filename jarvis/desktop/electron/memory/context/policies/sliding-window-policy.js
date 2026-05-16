'use strict';

function applySlidingWindow(chunks = [], {
  maxChunks = 20,
  stickyKinds = ['active-task', 'recent-critical', 'repo-local'],
} = {}) {
  const sticky = [];
  const regular = [];

  for (const chunk of chunks) {
    if (stickyKinds.includes(chunk.kind)) sticky.push(chunk);
    else regular.push(chunk);
  }

  const combined = [...sticky, ...regular];
  return combined.slice(0, maxChunks);
}

module.exports = {
  applySlidingWindow,
};
