const { createRuntimeV2 } = require('../../../jarvis/desktop/electron/runtime');
const { createStreamManager } = require('../../../jarvis/desktop/electron/ai/streaming/stream-manager');

describe('streaming lifecycle integration', () => {
  test('enforces ownership and allows recovery', () => {
    const runtime = createRuntimeV2();
    const manager = createStreamManager({
      bus: runtime.bus,
      runtimeStreamManager: runtime.streamManager,
    });

    manager.createSession({ sessionId: 'session-1', ownerId: 'owner-1' });

    const first = manager.emit('session-1', 'owner-1', 'token', { token: 'A' });
    expect(first.ok).toBe(true);

    const stale = manager.emit('session-1', 'owner-2', 'token', { token: 'B' });
    expect(stale.ok).toBe(false);

    const recovered = manager.recover('session-1', 0);
    expect(recovered.length).toBeGreaterThanOrEqual(1);
    expect(recovered[0].payload.token).toBe('A');
  });
});
