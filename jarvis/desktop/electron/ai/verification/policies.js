'use strict';

function createVerificationPolicy({ alwaysChecks = ['syntax', 'patch-sanity', 'imports'], heavyChecks = ['lint', 'build', 'tests'] } = {}) {
  return {
    resolveChecks({ taskType = 'general', requestedChecks = [] } = {}) {
      const checks = new Set(alwaysChecks);
      for (const check of requestedChecks) checks.add(check);
      if (taskType === 'coding' || taskType === 'architecture') {
        for (const check of heavyChecks) checks.add(check);
      }
      return [...checks];
    },
  };
}

module.exports = { createVerificationPolicy };
