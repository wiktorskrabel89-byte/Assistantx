'use strict';

async function executeStructuredAction({ action, registry, permissions, audit }) {
  const tool = registry.get(action.tool);
  if (!tool) return { ok: false, error: 'tool-not-found' };

  const authorization = await permissions.authorize(tool.permission || action.tool, { tool: action.tool });
  if (!authorization.allowed) return { ok: false, error: `permission-denied:${authorization.reason}` };

  audit?.({ event: 'tool.executed', tool: action.tool, at: new Date().toISOString() });
  return tool.run(action.params || {});
}

module.exports = { executeStructuredAction };
