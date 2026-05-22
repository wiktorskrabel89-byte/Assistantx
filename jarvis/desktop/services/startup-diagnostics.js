'use strict';

const ALLOWED = new Set(['healthy', 'starting', 'degraded', 'unavailable', 'crashed', 'stopped']);
const NON_BLOCKING_COMPONENTS = new Set(['updater', 'ollama']);

function createStartupDiagnostics() {
  const components = {
    db: { status: 'starting', detail: 'Validating database runtime.', reason: 'starting', details: {}, phase: 'validating-runtime', updatedAt: new Date().toISOString() },
    sidecar: { status: 'starting', detail: 'Waiting for AI runtime bootstrap.', reason: 'starting', details: {}, phase: 'starting', updatedAt: new Date().toISOString() },
    ollama: { status: 'starting', detail: 'Checking local Ollama runtime.', reason: 'starting', details: {}, phase: 'probing', updatedAt: new Date().toISOString() },
    updater: { status: 'starting', detail: 'Initializing updater subsystem.', reason: 'starting', details: {}, phase: 'initializing', updatedAt: new Date().toISOString() },
    launcher: { status: 'starting', detail: 'Validating launcher runtime.', reason: 'starting', details: {}, phase: 'validating-runtime', updatedAt: new Date().toISOString() },
  };
  const events = [];

  function setComponent(name, status, detailOrPayload = '') {
    const normalized = ALLOWED.has(status) ? status : 'degraded';
    const payload = detailOrPayload && typeof detailOrPayload === 'object'
      ? detailOrPayload
      : { detail: detailOrPayload };
    const detail = String(payload.detail || '');
    const reason = String(payload.reason || '');
    const details = payload.details && typeof payload.details === 'object' ? payload.details : {};
    const phase = payload.phase ? String(payload.phase) : null;
    components[name] = {
      status: normalized,
      detail,
      reason,
      details,
      phase,
      updatedAt: new Date().toISOString(),
    };
  }

  function setPhase(name, phase, detail = '', metadata = {}) {
    const current = components[name];
    const status = current && ['healthy', 'degraded', 'unavailable', 'crashed', 'stopped'].includes(current.status)
      ? current.status
      : 'starting';
    setComponent(name, status, {
      detail: detail || `Entering phase: ${phase}`,
      reason: 'phase',
      phase,
      details: metadata,
    });
  }

  function pushEvent(source, severity, message, metadata = {}) {
    events.unshift({
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      severity,
      message,
      metadata,
      createdAt: new Date().toISOString(),
    });
    if (events.length > 80) events.length = 80;
  }

  function getOverallStatus() {
    const all = Object.entries(components)
      .filter(([name]) => !NON_BLOCKING_COMPONENTS.has(name))
      .map(([, item]) => item.status);
    if (all.includes('unavailable')) return 'unavailable';
    if (all.includes('crashed')) return 'crashed';
    if (all.includes('degraded') || all.includes('stopped')) return 'degraded';
    if (all.includes('starting')) return 'starting';
    return 'healthy';
  }

  function snapshot() {
    return {
      overall: getOverallStatus(),
      components: { ...components },
      events: [...events],
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    pushEvent,
    setComponent,
    setPhase,
    snapshot,
  };
}

module.exports = { createStartupDiagnostics };
