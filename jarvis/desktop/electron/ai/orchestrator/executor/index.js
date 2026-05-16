'use strict';

function createExecutor({ runtime, toolEngine, directHandlers } = {}) {
  const handlers = {
    ...(directHandlers || {}),
  };

  async function executeNode(node, context = {}) {
    if (!node) return { ok: false, error: 'missing-node' };

    if (node.type === 'tool' && node.tool) {
      if (!toolEngine || typeof toolEngine.execute !== 'function') {
        return { ok: false, error: 'missing-tool-engine' };
      }
      return toolEngine.execute({
        action: {
          tool: node.tool,
          params: node.params || {},
        },
        sessionId: context.sessionId,
        taskId: context.taskId,
        correlationId: context.correlationId,
      });
    }

    if (node.type === 'respond') {
      const respond = handlers.respond;
      if (typeof respond !== 'function') return { ok: false, error: 'missing-respond-handler' };
      const result = await respond(node.params || {}, context);
      return { ok: true, result };
    }

    const custom = handlers[node.type];
    if (typeof custom === 'function') {
      const result = await custom(node.params || {}, context);
      return { ok: true, result };
    }

    runtime?.logger?.warn('orchestrator.executor.unknown-node-type', {
      sessionId: context.sessionId,
      taskId: context.taskId,
      nodeType: node.type,
      nodeId: node.id,
      correlationId: context.correlationId,
    });
    return { ok: false, error: `unknown-node-type:${node.type}` };
  }

  return {
    executeNode,
  };
}

module.exports = { createExecutor };
