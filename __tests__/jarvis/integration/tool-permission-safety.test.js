const { createToolRegistry } = require('../../../jarvis/desktop/electron/tools/registry');
const { executeStructuredAction } = require('../../../jarvis/desktop/electron/tools/execution-engine');
const { createPermissionPolicy } = require('../../../jarvis/desktop/electron/permissions/policy');
const { createExecutionSandbox } = require('../../../jarvis/desktop/electron/sandbox/execution-sandbox');

describe('tool safety integration', () => {
  test('blocks dangerous command payloads', async () => {
    const registry = createToolRegistry();
    registry.register({
      name: 'terminal.exec',
      permission: 'terminal.exec',
      run: async () => ({ ok: true }),
    });

    const permissions = createPermissionPolicy();
    const sandbox = createExecutionSandbox();

    const result = await executeStructuredAction({
      action: {
        tool: 'terminal.exec',
        params: { command: 'rm -rf /' },
      },
      registry,
      permissions,
      sandbox,
      sessionId: 'test-session',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('dangerous-command');
  });
});
