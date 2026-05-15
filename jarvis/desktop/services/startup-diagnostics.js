'use strict';

const ALLOWED = new Set(['healthy', 'degraded', 'unavailable']);

function createStartupDiagnostics() {
  const components = {
    db: { status: 'healthy', detail: 'Pending init.', updatedAt: new Date().toISOString() },
    sidecar: { status: 'healthy', detail: 'Pending start.', updatedAt: new Date().toISOString() },
    updater: { status: 'healthy', detail: 'Pending init.', updatedAt: new Date().toISOString() },
    launcher: { status: 'healthy', detail: 'Pending refresh.', updatedAt: new Date().toISOString() },
  };
  const events = [];

  function setComponent(name, status, detail = '') {
    const normalized = ALLOWED.has(status) ? status : 'degraded';
    components[name] = {
      status: normalized,
      detail: String(detail || ''),
      updatedAt: new Date().toISOString(),
    };
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
    const all = Object.values(components).map((item) => item.status);
    if (all.includes('unavailable')) return 'unavailable';
    if (all.includes('degraded')) return 'degraded';
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
    snapshot,
  };
}

module.exports = { createStartupDiagnostics };
