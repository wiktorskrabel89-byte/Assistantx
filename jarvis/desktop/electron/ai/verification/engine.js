'use strict';

const { createVerificationPolicy } = require('./policies');

function checkSyntax(result) {
  if (result?.ok === false) return { ok: false, reason: 'execution-failed' };
  return { ok: true };
}

function checkPatchSanity(result) {
  if (typeof result?.patch === 'string' && !result.patch.includes('*** Begin Patch')) {
    return { ok: false, reason: 'patch-invalid' };
  }
  return { ok: true };
}

function checkImports(result) {
  if (Array.isArray(result?.importErrors) && result.importErrors.length > 0) {
    return { ok: false, reason: 'import-errors-detected' };
  }
  return { ok: true };
}

function checkOutputSanity(result) {
  if (result?.ok === false) return { ok: false, reason: result.error || 'output-not-ok' };
  return { ok: true };
}

function createVerificationEngine({ validators = {}, policy } = {}) {
  const verificationPolicy = policy || createVerificationPolicy();

  const builtins = {
    syntax: checkSyntax,
    'patch-sanity': checkPatchSanity,
    imports: checkImports,
    'output-sanity': checkOutputSanity,
    ...validators,
  };

  async function runCheck(name, execution, context = {}) {
    const fn = builtins[name];
    if (typeof fn !== 'function') {
      return { ok: true, skipped: true, reason: 'unknown-check' };
    }
    const result = await fn(execution, context);
    return { name, ...(result || { ok: true }) };
  }

  async function verify(execution, context = {}) {
    const checks = verificationPolicy.resolveChecks({
      taskType: context.taskType || 'general',
      requestedChecks: context.checks || [],
    });

    const outcomes = [];
    for (const check of checks) {
      const outcome = await runCheck(check, execution, context);
      outcomes.push(outcome);
      if (!outcome.ok) {
        return {
          ok: false,
          failedCheck: check,
          outcomes,
          reason: outcome.reason || 'verification-failed',
        };
      }
    }

    return {
      ok: true,
      outcomes,
    };
  }

  return {
    verify,
  };
}

module.exports = { createVerificationEngine };
