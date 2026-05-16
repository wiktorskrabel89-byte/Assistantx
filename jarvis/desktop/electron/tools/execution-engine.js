'use strict';

const { validateAction, validateParams } = require('./validators/parameter-validator');
const { validatePatchPayload } = require('./validators/patch-validator');
const { sanitizeParams } = require('./sanitizers/command-sanitizer');
const { enforceFilesystemScope } = require('./permissions/scope-policy');
const { createToolAuditLogger } = require('./audit/audit-log');
const { createToolRateLimiter } = require('./execution/rate-limiter');

const sharedRateLimiter = createToolRateLimiter();

async function executeStructuredAction({
  action,
  registry,
  permissions,
  audit,
  sandbox,
  requester = 'unknown',
  sessionId = 'default',
  taskId = null,
  correlationId = null,
  rateLimiter = sharedRateLimiter,
  bus,
}) {
  const actionValidation = validateAction(action);
  if (!actionValidation.ok) return { ok: false, error: actionValidation.reason };

  const tool = registry.get(action.tool);
  if (!tool) return { ok: false, error: 'tool-not-found' };

  const paramsValidation = validateParams(action.params || {});
  if (!paramsValidation.ok) return { ok: false, error: `invalid-params:${paramsValidation.reason}` };

  const sanitized = sanitizeParams(action.params || {});
  if (!sanitized.ok) return { ok: false, error: sanitized.reason };

  const scope = enforceFilesystemScope({ ...(sanitized.params || {}) }, sandbox);
  if (!scope.ok) return { ok: false, error: scope.reason };

  if (typeof scope.params?.patch === 'string') {
    const patchValidation = validatePatchPayload(scope.params.patch);
    if (!patchValidation.ok) return { ok: false, error: patchValidation.reason };
  }

  const throttle = rateLimiter.consume(action.tool, sessionId);
  if (!throttle.ok) {
    return { ok: false, error: throttle.reason, retryAfterMs: throttle.retryAfterMs };
  }

  const authorization = await permissions.authorize(tool.permission || action.tool, {
    tool: action.tool,
    sessionId,
    taskId,
    correlationId,
  });
  if (!authorization.allowed) return { ok: false, error: `permission-denied:${authorization.reason}` };

  const auditLogger = createToolAuditLogger({ bus, sink: audit });
  const startedAt = Date.now();
  try {
    const result = await tool.run(scope.params || {});
    auditLogger.record({
      tool: action.tool,
      requester,
      sessionId,
      taskId,
      correlationId,
      params: scope.params || {},
      durationMs: Date.now() - startedAt,
      status: 'success',
    });
    return result;
  } catch (error) {
    auditLogger.record({
      tool: action.tool,
      requester,
      sessionId,
      taskId,
      correlationId,
      params: scope.params || {},
      durationMs: Date.now() - startedAt,
      status: 'error',
      error: error?.message || 'tool-execution-failed',
    });
    return {
      ok: false,
      error: error?.message || 'tool-execution-failed',
    };
  }
}

module.exports = { executeStructuredAction };
