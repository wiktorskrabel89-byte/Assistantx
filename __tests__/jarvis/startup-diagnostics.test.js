const { createStartupDiagnostics } = require('../../jarvis/desktop/services/startup-diagnostics');

describe('startup diagnostics health model', () => {
  it('treats updater as non-blocking for overall desktop health', () => {
    const diagnostics = createStartupDiagnostics();
    diagnostics.setComponent('db', 'healthy', 'Database ready');
    diagnostics.setComponent('sidecar', 'healthy', 'Sidecar ready');
    diagnostics.setComponent('launcher', 'healthy', 'Launcher ready');
    diagnostics.setComponent('updater', 'unavailable', 'Updater feed offline');

    const snapshot = diagnostics.snapshot();
    expect(snapshot.overall).toBe('healthy');
    expect(snapshot.components.updater.status).toBe('unavailable');
  });

  it('returns starting when critical components are still booting', () => {
    const diagnostics = createStartupDiagnostics();
    diagnostics.setComponent('db', 'healthy', 'Database ready');
    diagnostics.setComponent('sidecar', 'starting', 'Waiting for heartbeat');
    diagnostics.setComponent('launcher', 'healthy', 'Launcher ready');

    expect(diagnostics.snapshot().overall).toBe('starting');
  });

  it('stores structured reason, phase, and details for component states', () => {
    const diagnostics = createStartupDiagnostics();
    diagnostics.setComponent('sidecar', 'degraded', {
      detail: 'AI runtime heartbeat failed.',
      reason: 'health_timeout',
      phase: 'waiting-for-heartbeat',
      details: { startupTimeMs: 18234 },
    });

    const component = diagnostics.snapshot().components.sidecar;
    expect(component).toMatchObject({
      status: 'degraded',
      detail: 'AI runtime heartbeat failed.',
      reason: 'health_timeout',
      phase: 'waiting-for-heartbeat',
      details: { startupTimeMs: 18234 },
    });
  });
});
