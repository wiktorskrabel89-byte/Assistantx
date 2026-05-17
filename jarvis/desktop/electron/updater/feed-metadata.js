'use strict';

const crypto = require('crypto');

const SEMVER_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

function parseSemver(value) {
  const raw = String(value || '').trim();
  const match = raw.match(SEMVER_PATTERN);
  if (!match) return null;
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareSemverIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (leftNum > rightNum) return 1;
    if (leftNum < rightNum) return -1;
    return 0;
  }
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const aIds = a.prerelease.split('.');
  const bIds = b.prerelease.split('.');
  const maxLen = Math.max(aIds.length, bIds.length);
  for (let i = 0; i < maxLen; i += 1) {
    const aId = aIds[i];
    const bId = bIds[i];
    if (aId === undefined) return -1;
    if (bId === undefined) return 1;
    const cmp = compareSemverIdentifiers(aId, bId);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function normalizeUpdaterChannel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'latest' || raw === 'stable') return 'stable';
  if (raw.includes('beta') || raw === 'prerelease') return 'beta';
  return raw;
}

function isStableChannel(channel) {
  return normalizeUpdaterChannel(channel) === 'stable';
}

function buildMetadataSignatureUrl(metadataUrl) {
  const base = String(metadataUrl || '').trim();
  return base ? `${base}.sig` : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractYamlScalar(raw, key) {
  const source = String(raw || '');
  const match = source.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*:\\s*["']?([^"'\\r\\n#]+)["']?\\s*$`, 'm'));
  return match ? match[1].trim() : '';
}

function normalizeStagingPercentage(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^(100|\d{1,2})$/.test(raw)) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return numeric;
}

function collectArtifactReferences(raw) {
  const source = String(raw || '');
  const matches = [
    ...source.matchAll(/^\s*path\s*:\s*["']?([^"'\r\n#]+)["']?\s*$/gm),
    ...source.matchAll(/^\s*url\s*:\s*["']?([^"'\r\n#]+)["']?\s*$/gm),
  ];
  return matches
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function extractLatestFeedMetadata(raw) {
  const source = String(raw || '');
  const stagingPercentageRaw = extractYamlScalar(source, 'stagingPercentage');
  return {
    raw: source,
    version: extractYamlScalar(source, 'version'),
    channel: extractYamlScalar(source, 'channel') || 'stable',
    minimumAllowedVersion: extractYamlScalar(source, 'minimumAllowedVersion'),
    stagingPercentageRaw,
    stagingPercentage: normalizeStagingPercentage(stagingPercentageRaw),
    artifacts: collectArtifactReferences(source),
    hasArtifactRef: collectArtifactReferences(source).length > 0,
  };
}

function validateLatestFeedMetadata({ metadata, runtimeChannel }) {
  if (!metadata?.raw?.trim() || !metadata?.version || !metadata?.hasArtifactRef) {
    return {
      ok: false,
      reason: 'feed-metadata-invalid-or-missing',
      detail: 'Update metadata is missing required version or artifact references.',
    };
  }
  if (!parseSemver(metadata.version)) {
    return {
      ok: false,
      reason: 'feed-version-invalid',
      detail: `Updater metadata version '${metadata.version}' is not valid semver.`,
    };
  }
  if (metadata.minimumAllowedVersion) {
    if (!parseSemver(metadata.minimumAllowedVersion)) {
      return {
        ok: false,
        reason: 'feed-minimum-version-invalid',
        detail: `Updater metadata minimumAllowedVersion '${metadata.minimumAllowedVersion}' is not valid semver.`,
      };
    }
    const minimumCmp = compareSemver(metadata.version, metadata.minimumAllowedVersion);
    if (minimumCmp === null || minimumCmp < 0) {
      return {
        ok: false,
        reason: 'feed-version-below-minimum-allowed',
        detail: `Updater metadata version (${metadata.version}) is below minimumAllowedVersion (${metadata.minimumAllowedVersion}).`,
      };
    }
  }
  if (metadata.stagingPercentageRaw && metadata.stagingPercentage === null) {
    return {
      ok: false,
      reason: 'feed-rollout-invalid',
      detail: `Updater metadata stagingPercentage '${metadata.stagingPercentageRaw}' must be an integer between 0 and 100.`,
    };
  }
  if (isStableChannel(runtimeChannel) && (!isStableChannel(metadata.channel) || metadata.version.includes('-'))) {
    return {
      ok: false,
      reason: 'feed-channel-version-mismatch',
      detail: 'Stable updater channel received beta/prerelease metadata.',
    };
  }
  return { ok: true };
}

function classifyUpdateVersionSanity({
  availableVersion,
  currentVersion,
  runtimeChannel,
  metadataChannel,
  minimumAllowedVersion = '',
}) {
  if (!parseSemver(availableVersion)) {
    return {
      ok: false,
      reason: 'feed-version-invalid',
      detail: `Updater metadata version '${availableVersion}' is not valid semver.`,
    };
  }
  if (!parseSemver(currentVersion)) {
    return {
      ok: false,
      reason: 'current-version-invalid',
      detail: `Current app version '${currentVersion}' is not valid semver.`,
    };
  }
  if (minimumAllowedVersion) {
    if (!parseSemver(minimumAllowedVersion)) {
      return {
        ok: false,
        reason: 'feed-minimum-version-invalid',
        detail: `Updater metadata minimumAllowedVersion '${minimumAllowedVersion}' is not valid semver.`,
      };
    }
    const minimumCmp = compareSemver(availableVersion, minimumAllowedVersion);
    if (minimumCmp === null || minimumCmp < 0) {
      return {
        ok: false,
        reason: 'feed-version-below-minimum-allowed',
        detail: `Updater metadata version (${availableVersion}) is below minimumAllowedVersion (${minimumAllowedVersion}).`,
      };
    }
  }
  const cmp = compareSemver(availableVersion, currentVersion);
  if (cmp === null) {
    return {
      ok: false,
      reason: 'feed-version-compare-failed',
      detail: 'Failed to compare updater version metadata.',
    };
  }
  if (cmp <= 0) {
    return {
      ok: false,
      reason: 'feed-version-not-newer',
      detail: `Updater metadata version (${availableVersion}) is not newer than current app version (${currentVersion}).`,
    };
  }

  const stableRuntime = isStableChannel(runtimeChannel);
  const normalizedMetadataChannel = normalizeUpdaterChannel(metadataChannel);
  const metadataExplicitlyBeta = normalizedMetadataChannel === 'beta';
  const isPrereleaseVersion = String(availableVersion).includes('-');
  if (stableRuntime && (metadataExplicitlyBeta || isPrereleaseVersion)) {
    return {
      ok: false,
      reason: 'feed-channel-version-mismatch',
      detail: 'Stable updater channel received beta/prerelease metadata.',
    };
  }
  return { ok: true };
}

function looksLikePemKey(value) {
  return /-----BEGIN [A-Z0-9 ]+-----/.test(String(value || ''));
}

function normalizeKeyMaterial(value) {
  let normalized = String(value || '').replace(/\r/g, '').trim();
  if (normalized.includes('\\n') && !normalized.includes('\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  return normalized.trim();
}

function tryDecodeBase64KeyMaterial(value) {
  const normalized = normalizeKeyMaterial(value).replace(/\s+/g, '');
  if (!normalized || looksLikePemKey(normalized) || !/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    return null;
  }
  try {
    const decoded = Buffer.from(normalized, 'base64');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function buildKeyMaterialCandidates(value) {
  const normalized = normalizeKeyMaterial(value);
  const candidates = [];
  const seen = new Set();

  function addCandidate(candidate) {
    if (!candidate) return;
    const key = Buffer.isBuffer(candidate)
      ? `buffer:${candidate.toString('base64')}`
      : `text:${String(candidate)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  addCandidate(normalized);

  const decoded = tryDecodeBase64KeyMaterial(normalized);
  if (!decoded) return candidates;

  const decodedText = normalizeKeyMaterial(decoded.toString('utf8'));
  if (looksLikePemKey(decodedText)) {
    addCandidate(decodedText);
  }
  addCandidate(decoded);
  return candidates;
}

function createKeyObjectFromCandidate(candidate, kind) {
  const create = kind === 'private' ? crypto.createPrivateKey : crypto.createPublicKey;
  const derTypes = kind === 'private' ? ['pkcs8', 'pkcs1', 'sec1'] : ['spki', 'pkcs1'];

  if (candidate && typeof candidate === 'object' && typeof candidate.export === 'function' && candidate.type) {
    return candidate;
  }

  if (Buffer.isBuffer(candidate)) {
    for (const type of derTypes) {
      try {
        return create({ key: candidate, format: 'der', type });
      } catch {}
    }
  }

  return create(candidate);
}

function resolveUpdaterKeyObject(kind, value) {
  const errors = [];
  for (const candidate of buildKeyMaterialCandidates(value)) {
    try {
      return createKeyObjectFromCandidate(candidate, kind);
    } catch (error) {
      errors.push(error);
    }
  }

  const lastError = errors[errors.length - 1];
  throw new Error(
    lastError?.message
      ? `Unsupported updater metadata ${kind} key format: ${lastError.message}`
      : `Unsupported updater metadata ${kind} key format.`,
  );
}

function exportPublicKeyPem(value) {
  const publicKey = resolveUpdaterKeyObject('public', value);
  return `${String(publicKey.export({ type: 'spki', format: 'pem' })).trim()}\n`;
}

function signDetachedMetadata({ payload, privateKey }) {
  const normalizedPayload = String(payload || '');
  const normalizedKey = String(privateKey || '').trim();
  if (!normalizedPayload || !normalizedKey) {
    throw new Error('Missing updater metadata payload or private key.');
  }
  return crypto.sign(
    'sha256',
    Buffer.from(normalizedPayload, 'utf8'),
    resolveUpdaterKeyObject('private', privateKey),
  ).toString('base64');
}

function verifyDetachedMetadataSignature({ payload, signature, publicKey }) {
  const normalizedPayload = String(payload || '');
  const normalizedSignature = String(signature || '').replace(/\s+/g, '');
  if (!normalizedPayload || !normalizedSignature || !String(publicKey || '').trim()) {
    return {
      ok: false,
      reason: 'signature-validation-failed',
      detail: 'Missing updater metadata signature or public key.',
    };
  }
  try {
    const verified = crypto.verify(
      'sha256',
      Buffer.from(normalizedPayload, 'utf8'),
      resolveUpdaterKeyObject('public', publicKey),
      Buffer.from(normalizedSignature, 'base64'),
    );
    return verified
      ? { ok: true }
      : {
        ok: false,
        reason: 'signature-validation-failed',
        detail: 'Updater metadata detached signature verification failed.',
      };
  } catch (error) {
    return {
      ok: false,
      reason: 'signature-validation-failed',
      detail: `Updater metadata signature verification failed: ${error?.message || error}`,
    };
  }
}

function computeRolloutBucket({ stableId, version }) {
  const input = `${stableId || ''}:${version || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 100;
}

function isUserWithinStagedRollout({ stagingPercentage, stableId, version }) {
  if (stagingPercentage === null || stagingPercentage === undefined) {
    return { eligible: true, percentage: null, bucket: null, reason: 'no-staged-rollout' };
  }
  if (!String(stableId || '').trim()) {
    return { eligible: false, percentage: stagingPercentage, bucket: null, reason: 'missing-stable-id' };
  }
  if (stagingPercentage <= 0) {
    return { eligible: false, percentage: stagingPercentage, bucket: 100, reason: 'rollout-zero-percent' };
  }
  if (stagingPercentage >= 100) {
    return { eligible: true, percentage: stagingPercentage, bucket: 0, reason: 'full-rollout' };
  }
  const bucket = computeRolloutBucket({ stableId, version });
  return {
    eligible: bucket < stagingPercentage,
    percentage: stagingPercentage,
    bucket,
    reason: bucket < stagingPercentage ? 'rollout-eligible' : 'staged-rollout-not-eligible',
  };
}

function classifySignatureDiagnostic(message) {
  const lower = String(message || '').toLowerCase();
  if (/smartscreen/.test(lower)) return 'smartscreen-reputation';
  if (/unsigned|not signed|no signature/.test(lower)) return 'unsigned-installer';
  if (/expired|certificate has expired/.test(lower)) return 'certificate-expired';
  if (/revoked/.test(lower)) return 'certificate-revoked';
  if (/timestamp|time stamping|tsa/.test(lower)) return 'timestamp-invalid';
  if (/publisher name|trust chain|authenticode|unable to verify|certificate|signature/.test(lower)) {
    return 'signature-untrusted';
  }
  return null;
}

function classifyInstallerBlocker(message) {
  const lower = String(message || '').toLowerCase();
  if (/access is denied|used by another process|being used|file in use|sharing violation|\blocked\b|lock contention|eperm/.test(lower)) {
    return 'file-lock-detected';
  }
  if (/antivirus|defender|malware|virus|security software/.test(lower)) {
    return 'security-software-block';
  }
  if (/still running|process is running|app is running/.test(lower)) {
    return 'app-still-running';
  }
  return null;
}

module.exports = {
  buildMetadataSignatureUrl,
  classifyInstallerBlocker,
  classifySignatureDiagnostic,
  classifyUpdateVersionSanity,
  collectArtifactReferences,
  compareSemver,
  computeRolloutBucket,
  exportPublicKeyPem,
  extractLatestFeedMetadata,
  isStableChannel,
  isUserWithinStagedRollout,
  normalizeStagingPercentage,
  normalizeUpdaterChannel,
  parseSemver,
  signDetachedMetadata,
  validateLatestFeedMetadata,
  verifyDetachedMetadataSignature,
};
