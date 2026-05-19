'use strict';

const RISK_BY_ACTION = {
  'open-url': 'medium',
  'open-path': 'medium',
  'launcher-launch': 'medium',
  'jarvis-ai-request': 'medium',
  'open-account-login': 'medium',
  'install-everything-search': 'low',
  'setup:install-local': 'medium',
  'server:verify-pairing': 'medium',
  'server:set-permission-level': 'high',
  'server:kill-switch': 'medium',
};

function createPermissionPolicy({ onAudit } = {}) {
  const revokedActions = new Set();
  const consentMap = new Map();

  function audit(entry) {
    if (typeof onAudit === 'function') onAudit(entry);
  }

  function revoke(action) {
    revokedActions.add(action);
    audit({ type: 'permission.revoked', action, at: new Date().toISOString() });
  }

  function grant(action) {
    revokedActions.delete(action);
    consentMap.set(action, true);
    audit({ type: 'permission.granted', action, at: new Date().toISOString() });
  }

  async function authorize(action, context = {}) {
    const risk = RISK_BY_ACTION[action] || 'low';
    if (revokedActions.has(action)) {
      audit({ type: 'permission.denied', action, reason: 'revoked', context, at: new Date().toISOString() });
      return { allowed: false, reason: 'revoked' };
    }
    const hasConsent = consentMap.get(action) === true;
    if (risk === 'high' && !hasConsent) {
      audit({ type: 'permission.denied', action, reason: 'consent-required', context, at: new Date().toISOString() });
      return { allowed: false, reason: 'consent-required' };
    }
    audit({ type: 'permission.allowed', action, risk, context, at: new Date().toISOString() });
    return { allowed: true, reason: hasConsent ? 'consented' : 'policy-allowed', risk };
  }

  return {
    authorize,
    revoke,
    grant,
    getSnapshot() {
      return {
        revoked: [...revokedActions],
        consented: [...consentMap.entries()].filter(([, ok]) => ok).map(([action]) => action),
      };
    },
  };
}

module.exports = {
  createPermissionPolicy,
};
