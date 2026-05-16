'use strict';

function sanitizeMemoryInput(value) {
  return String(value || '')
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/```[\s\S]*?```/g, '[code-block-removed]')
    .trim();
}

module.exports = {
  sanitizeMemoryInput,
};
