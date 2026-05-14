const { normalizeKey, normalizeName } = require('./app-scanner');

const AUTO_THRESHOLD = 0.88;
const CONFIRM_THRESHOLD = 0.72;

function toCandidate(value, launchMode = 'start', via = 'fallback') {
  if (!value) return null;
  return { value: String(value), launchMode, via };
}

function toCandidateList(targets, via = 'builtin') {
  const list = Array.isArray(targets) ? targets : [targets];
  return list.map((value) => toCandidate(value, 'start', via)).filter(Boolean);
}

function levDistance(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x) return y.length;
  if (!y) return x.length;

  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= y.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[x.length][y.length];
}

function similarity(a, b) {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 0;
  return 1 - (levDistance(left, right) / maxLen);
}

function buildSearchIndex({ knownOpenMap, discoveredApps, aliases }) {
  const rows = [];

  for (const [key, value] of Object.entries(knownOpenMap || {})) {
    rows.push({
      key,
      label: key,
      scoreHint: 1,
      candidates: toCandidateList(value, 'builtin'),
      source: 'builtin',
    });
  }

  for (const app of discoveredApps || []) {
    const key = normalizeKey(app.key || app.name);
    const aliasesList = Array.isArray(app.aliases) ? app.aliases : [];
    if (!key || !app.launchTarget) continue;
    rows.push({
      key,
      label: normalizeName(app.name) || key,
      aliases: aliasesList,
      scoreHint: 0.95,
      candidates: [toCandidate(app.launchTarget, app.launchMode || 'filePath', 'discovered')],
      source: 'discovered',
    });
  }

  for (const [alias, target] of Object.entries(aliases || {})) {
    const normalizedAlias = normalizeKey(alias);
    const targetKey = normalizeKey(target);
    if (!normalizedAlias || !targetKey) continue;
    rows.push({
      key: targetKey,
      label: targetKey,
      aliases: [normalizedAlias],
      scoreHint: 1,
      source: 'alias',
    });
  }

  return rows;
}

function selectBestMatch(input, rows, { strictRemote = false } = {}) {
  const inputKey = normalizeKey(input);
  const items = [];

  for (const row of rows) {
    const probes = new Set([row.key, row.label, ...(row.aliases || [])]);
    let best = 0;
    let matched = row.key;
    for (const probe of probes) {
      const score = similarity(inputKey, probe);
      if (score > best) {
        best = score;
        matched = probe;
      }
    }
    if (best > 0) items.push({ row, score: best, matched });
  }

  items.sort((a, b) => b.score - a.score);
  const best = items[0];
  const second = items[1];
  if (!best) return { status: 'unknown', items };

  const autoThreshold = strictRemote ? Math.max(AUTO_THRESHOLD, 0.92) : AUTO_THRESHOLD;
  const confirmThreshold = strictRemote ? Math.max(CONFIRM_THRESHOLD, 0.82) : CONFIRM_THRESHOLD;

  if (best.score >= autoThreshold && (!second || (best.score - second.score) >= 0.06)) {
    return { status: 'auto', best, second, items };
  }

  if (best.score >= confirmThreshold) {
    return { status: 'needs_confirmation', best, second, items };
  }

  return { status: 'unknown', best, second, items };
}

function resolveAppTarget(rawApp, options = {}) {
  const input = String(rawApp || '').trim();
  const inputKey = normalizeKey(input);
  if (!input) {
    return {
      status: 'invalid',
      reason: 'missing-app',
      input,
      candidates: [],
      suggestions: [],
    };
  }

  const knownOpenMap = options.knownOpenMap || {};
  const directAlias = options.aliases?.[inputKey];
  if (directAlias) {
    const targetKey = normalizeKey(directAlias);
    const known = knownOpenMap[targetKey];
    const discovered = (options.discoveredApps || []).find((item) => normalizeKey(item.key || item.name) === targetKey);
    const candidates = known
      ? toCandidateList(known, 'alias')
      : discovered
        ? [toCandidate(discovered.launchTarget, discovered.launchMode || 'filePath', 'alias')]
        : [toCandidate(directAlias, 'start', 'alias')];

    return {
      status: 'resolved',
      strategy: 'alias_exact',
      confidence: 1,
      resolvedKey: targetKey,
      matchedInput: input,
      candidates,
      suggestions: [],
      feedback: `Using alias "${input}" → "${targetKey}".`,
    };
  }

  const exactKnown = knownOpenMap[inputKey];
  if (exactKnown) {
    return {
      status: 'resolved',
      strategy: 'known_exact',
      confidence: 1,
      resolvedKey: inputKey,
      matchedInput: input,
      candidates: toCandidateList(exactKnown, 'builtin'),
      suggestions: [],
      feedback: null,
    };
  }

  const exactDiscovered = (options.discoveredApps || []).find((item) => normalizeKey(item.key || item.name) === inputKey);
  if (exactDiscovered) {
    return {
      status: 'resolved',
      strategy: 'discovered_exact',
      confidence: 0.98,
      resolvedKey: inputKey,
      matchedInput: input,
      candidates: [toCandidate(exactDiscovered.launchTarget, exactDiscovered.launchMode || 'filePath', 'discovered')],
      suggestions: [],
      feedback: null,
    };
  }

  const index = buildSearchIndex({
    knownOpenMap,
    discoveredApps: options.discoveredApps || [],
    aliases: options.aliases || {},
  });
  const match = selectBestMatch(input, index, { strictRemote: options.strictRemote });

  if (match.status === 'unknown' || !match.best) {
    return {
      status: 'unknown',
      strategy: 'fuzzy_none',
      confidence: 0,
      resolvedKey: null,
      matchedInput: input,
      candidates: [],
      suggestions: (match.items || []).slice(0, 3).map((item) => item.row.key),
      feedback: null,
    };
  }

  const resolvedRow = match.best.row;
  const candidates = (resolvedRow.candidates || []).length > 0
    ? resolvedRow.candidates
    : (knownOpenMap[resolvedRow.key] ? toCandidateList(knownOpenMap[resolvedRow.key], resolvedRow.source) : []);

  if (match.status === 'needs_confirmation') {
    return {
      status: 'ambiguous',
      strategy: 'fuzzy_ambiguous',
      confidence: match.best.score,
      resolvedKey: resolvedRow.key,
      matchedInput: match.best.matched,
      candidates,
      suggestions: (match.items || []).slice(0, 4).map((item) => item.row.key),
      feedback: `I matched "${input}" to "${resolvedRow.key}" with ${(match.best.score * 100).toFixed(0)}% confidence. Please be more specific.`,
    };
  }

  return {
    status: 'resolved',
    strategy: 'fuzzy_auto',
    confidence: match.best.score,
    resolvedKey: resolvedRow.key,
    matchedInput: match.best.matched,
    candidates,
    suggestions: [],
    feedback: `Matched "${input}" to "${resolvedRow.key}" (${(match.best.score * 100).toFixed(0)}% confidence).`,
  };
}

module.exports = {
  AUTO_THRESHOLD,
  CONFIRM_THRESHOLD,
  resolveAppTarget,
  similarity,
};
