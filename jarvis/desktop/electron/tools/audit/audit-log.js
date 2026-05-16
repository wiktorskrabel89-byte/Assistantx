'use strict';

const crypto = require('crypto');

function redacted(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 12) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function hashParams(params = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(params || {}))
    .digest('hex');
}

function createToolAuditLogger({ bus, sink } = {}) {
  function record(entry = {}) {
    const payload = {
      event: 'tool.audit',
      tool: entry.tool || 'unknown',
      requester: entry.requester || 'unknown',
      sessionId: entry.sessionId || null,
      taskId: entry.taskId || null,
      correlationId: entry.correlationId || null,
      paramsHash: hashParams(entry.params || {}),
      paramsPreview: Object.fromEntries(Object.entries(entry.params || {}).map(([key, value]) => [key, redacted(value)])),
      durationMs: Number(entry.durationMs || 0),
      status: entry.status || 'unknown',
      error: entry.error || null,
      at: entry.at || new Date().toISOString(),
    };
    if (typeof sink === 'function') sink(payload);
    bus?.publish('tool.audit', payload);
    return payload;
  }

  return {
    record,
  };
}

module.exports = {
  createToolAuditLogger,
};
