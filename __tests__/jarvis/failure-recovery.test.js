'use strict';

const {
  classifyError,
  getRemediationPlan,
} = require('../../jarvis/desktop/electron/recovery/failure-recovery');

describe('failure recovery taxonomy', () => {
  it('classifies transport failures', () => {
    expect(classifyError(new Error('WebSocket transport connection reset by peer'))).toBe('transport');
  });

  it('classifies memory corruption failures', () => {
    expect(classifyError(new Error('vector index corrupted in memory backend'))).toBe('memory-corruption');
  });

  it('maps permission failures to strict remediation tier', () => {
    const plan = getRemediationPlan('permission');
    expect(plan.tier).toBe('strict');
    expect(plan.actions).toContain('request-approval');
  });
});
