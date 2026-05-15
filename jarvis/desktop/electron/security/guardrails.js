'use strict';

const FORBIDDEN_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
  /\bexecuteJavaScript\b/,
];

function assertNoDynamicCodeExecution(codeSnippet, label = 'unknown') {
  const source = String(codeSnippet || '');
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) {
      throw new Error(`[security] Dynamic code execution blocked in ${label}`);
    }
  }
}

function sanitizeAuditValue(value, maxLen = 500) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

module.exports = {
  assertNoDynamicCodeExecution,
  sanitizeAuditValue,
};
