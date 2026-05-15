'use strict';

function analyzeRequest(request = {}) {
  const text = String(request.message || '').trim();
  const length = text.length;
  const complexity = length > 800 ? 'hard' : length > 200 ? 'medium' : 'simple';
  return {
    complexity,
    confidence: request.confidence ?? 0.7,
    codingDepth: request.codingDepth || (/(refactor|architecture|debug)/i.test(text) ? 'architecture' : 'basic'),
    contextSize: request.contextSize || (length > 1200 ? 'huge' : length > 400 ? 'medium' : 'small'),
    retryCount: Number(request.retryCount || 0),
  };
}

module.exports = { analyzeRequest };
