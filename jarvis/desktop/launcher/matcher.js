const { similarity } = require('../app-resolver');
const { normalizeKey, normalizeName } = require('../app-scanner');

const AUTO_THRESHOLD = 84;
const CONFIRM_THRESHOLD = 66;

function scoreProbe(inputKey, probe) {
  const normalizedProbe = normalizeKey(probe);
  if (!inputKey || !normalizedProbe) return 0;
  if (inputKey === normalizedProbe) return 100;
  if (normalizedProbe.startsWith(inputKey)) return 92;
  if (normalizedProbe.includes(inputKey)) return 86;
  if (inputKey.includes(normalizedProbe)) return 83;
  return Math.round(similarity(inputKey, normalizedProbe) * 100);
}

function getUsageBoost(app) {
  return Math.min(14, Number(app.launchCount || 0) * 1.5);
}

function getRecencyBoost(app) {
  if (!app.lastUsedAt) return 0;
  const ageMs = Date.now() - Date.parse(app.lastUsedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs < 60 * 60 * 1000) return 12;
  if (ageMs < 24 * 60 * 60 * 1000) return 8;
  if (ageMs < 7 * 24 * 60 * 60 * 1000) return 4;
  return 0;
}

function getTimeOfDayBoost(app) {
  const usageHours = app?.metadata?.usageHours || app?.usageHours || {};
  const hourKey = String(new Date().getHours());
  return Math.min(8, Number(usageHours[hourKey] || 0) * 2);
}

function getSourceBoost(app) {
  if (app.sourceProvider === 'everything') return 6;
  if (app.sourceProvider === 'builtin') return 5;
  if (app.sourceProvider === 'windows-fallback') return 3;
  return 0;
}

function buildCandidateScore(input, app) {
  const inputKey = normalizeKey(input);
  const probes = new Set([app.key, app.name, ...(app.aliases || [])]);
  let textScore = 0;
  let matchedProbe = app.key;
  for (const probe of probes) {
    const probeScore = scoreProbe(inputKey, probe);
    if (probeScore > textScore) {
      textScore = probeScore;
      matchedProbe = probe;
    }
  }

  const total = textScore + getUsageBoost(app) + getRecencyBoost(app) + getTimeOfDayBoost(app) + getSourceBoost(app);
  return {
    app,
    matchedProbe,
    textScore,
    score: Math.min(100, Math.round(total)),
    reasons: [
      textScore >= 100 ? 'exact-match' : null,
      matchedProbe !== app.key ? 'alias-match' : null,
      getUsageBoost(app) > 0 ? 'usage-history' : null,
      getRecencyBoost(app) > 0 ? 'recently-used' : null,
      getTimeOfDayBoost(app) > 0 ? 'time-of-day' : null,
      getSourceBoost(app) > 0 ? `${app.sourceProvider}-boost` : null,
    ].filter(Boolean),
  };
}

function rankApps(input, apps = [], options = {}) {
  const inputKey = normalizeKey(input);
  if (!inputKey) return { status: 'invalid', items: [] };
  const items = apps
    .map((app) => buildCandidateScore(inputKey, {
      ...app,
      key: normalizeKey(app.key || app.name),
      name: normalizeName(app.name || app.key),
    }))
    .filter((item) => item.textScore >= 45)
    .sort((left, right) => right.score - left.score || right.textScore - left.textScore || left.app.name.localeCompare(right.app.name));

  const best = items[0];
  const second = items[1];
  const strict = Boolean(options.strict);
  const autoThreshold = strict ? 90 : AUTO_THRESHOLD;
  const confirmThreshold = strict ? 76 : CONFIRM_THRESHOLD;

  if (!best) return { status: 'unknown', items: [] };
  if (best.score >= autoThreshold && (!second || (best.score - second.score) >= 6)) {
    return { status: 'auto', best, second, items };
  }
  if (best.score >= confirmThreshold) {
    return { status: 'confirm', best, second, items };
  }
  return { status: 'unknown', best, second, items };
}

module.exports = {
  AUTO_THRESHOLD,
  CONFIRM_THRESHOLD,
  rankApps,
};
