'use strict';

function createCleanupManager({ runtime } = {}) {
  async function cleanupExecution({ sessionId, taskId, reason } = {}) {
    runtime?.streamManager?.interrupt(sessionId, reason || 'cleanup');
    runtime?.cancellation?.cancel(taskId, reason || 'cleanup');
    runtime?.voiceInterruptions?.interrupt(sessionId, reason || 'cleanup');

    const workspace = runtime?.sandbox?.listWorkspaces?.().find((item) => item.taskId === taskId);
    if (workspace) runtime?.sandbox?.cleanupWorkspace?.(workspace.taskId);

    runtime?.logger?.info('recovery.cleanup.completed', {
      sessionId,
      taskId,
      reason: reason || 'cleanup',
      correlationId: runtime?.sessions?.getSession?.(sessionId)?.correlationId || null,
    });

    return { cleaned: true };
  }

  return {
    cleanupExecution,
  };
}

module.exports = { createCleanupManager };
