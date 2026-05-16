'use strict';

function sanitizeMemoryInput(value) {
  const withoutCodeBlocks = String(value || '')
    .replace(/```[\s\S]*?```/g, '[code-block-removed]')
    .trim();

  return withoutCodeBlocks
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sanitizeMemoryInput,
};
