'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SESSION_VERSION, normalizeSession, toSafeSessionView } = require('../validators');

let keytar = null;
try {
  keytar = require('keytar');
} catch {
  keytar = null;
}

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const ENCRYPTED_SESSION_PATH = path.join(BASE_DIR, 'session.enc');
const LEGACY_SESSION_PATH = path.join(BASE_DIR, 'session.json');
const KEYTAR_SERVICE = 'AssistantX';
const KEYTAR_ACCOUNT = 'session';
const KEY_SALT = 'assistantx-desktop-session-cache-v2';
let cachedSession = null;
let lock = Promise.resolve();

function withLock(task) {
  const next = lock.then(task, task);
  lock = next.then(() => undefined, () => undefined);
  return next;
}

function ensureBaseDir() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

function buildCipherKey() {
  const source = [
    os.hostname(),
    os.userInfo({ encoding: 'utf8' }).username,
    os.platform(),
    os.arch(),
  ].join('|');
  return crypto.pbkdf2Sync(source, KEY_SALT, 150000, 32, 'sha256');
}

function encryptSession(session) {
  const iv = crypto.randomBytes(12);
  const key = buildCipherKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), payload: encrypted.toString('base64') });
}

function decryptSession(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed?.iv || !parsed?.tag || !parsed?.payload) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    buildCipherKey(),
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return normalizeSession(JSON.parse(decrypted));
}

function writeEncryptedCacheSync(session) {
  ensureBaseDir();
  fs.writeFileSync(ENCRYPTED_SESSION_PATH, encryptSession(session), 'utf8');
}

function readEncryptedCacheSync() {
  try {
    if (!fs.existsSync(ENCRYPTED_SESSION_PATH)) return null;
    return decryptSession(fs.readFileSync(ENCRYPTED_SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function readLegacySessionSync() {
  try {
    if (!fs.existsSync(LEGACY_SESSION_PATH)) return null;
    return normalizeSession(JSON.parse(fs.readFileSync(LEGACY_SESSION_PATH, 'utf8')));
  } catch {
    return null;
  }
}

function deleteLegacySessionSync() {
  try {
    if (fs.existsSync(LEGACY_SESSION_PATH)) fs.unlinkSync(LEGACY_SESSION_PATH);
  } catch {
    // ignore
  }
}

async function persistKeytarSession(session) {
  if (!keytar) return false;
  try {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, JSON.stringify(session));
    return true;
  } catch (error) {
    console.warn('[auth][session] Keytar write failed, using encrypted fallback cache only:', error?.message || error);
    return false;
  }
}

async function readKeytarSession() {
  if (!keytar) return null;
  try {
    const raw = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch (error) {
    console.warn('[auth][session] Keytar read failed, falling back to encrypted cache:', error?.message || error);
    return null;
  }
}

async function deleteKeytarSession() {
  if (!keytar) return;
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch (error) {
    console.warn('[auth][session] Keytar delete failed:', error?.message || error);
  }
}

function bootstrapCachedSession() {
  if (cachedSession) return cachedSession;
  cachedSession = readEncryptedCacheSync() || readLegacySessionSync() || null;
  if (cachedSession && cachedSession.version !== SESSION_VERSION) {
    cachedSession = normalizeSession({ ...cachedSession, version: SESSION_VERSION });
    writeEncryptedCacheSync(cachedSession);
    deleteLegacySessionSync();
  }
  return cachedSession;
}

async function loadSession() {
  return withLock(async () => {
    const keytarSession = await readKeytarSession();
    if (keytarSession) {
      cachedSession = normalizeSession({ ...keytarSession, version: SESSION_VERSION });
      writeEncryptedCacheSync(cachedSession);
      deleteLegacySessionSync();
      return cachedSession ? { ...cachedSession } : null;
    }

    const encrypted = readEncryptedCacheSync();
    if (encrypted) {
      cachedSession = normalizeSession({ ...encrypted, version: SESSION_VERSION });
      await persistKeytarSession(cachedSession);
      deleteLegacySessionSync();
      return { ...cachedSession };
    }

    const legacy = readLegacySessionSync();
    if (legacy) {
      cachedSession = normalizeSession({ ...legacy, version: SESSION_VERSION });
      writeEncryptedCacheSync(cachedSession);
      await persistKeytarSession(cachedSession);
      deleteLegacySessionSync();
      return { ...cachedSession };
    }

    cachedSession = null;
    return null;
  });
}

function getCachedSession() {
  const session = cachedSession || bootstrapCachedSession();
  return session ? { ...session } : null;
}

async function saveSession(session) {
  return withLock(async () => {
    const normalized = normalizeSession({ ...session, version: SESSION_VERSION });
    if (!normalized) throw new Error('Invalid session payload');
    cachedSession = normalized;
    writeEncryptedCacheSync(normalized);
    await persistKeytarSession(normalized);
    deleteLegacySessionSync();
    return { ...normalized };
  });
}

async function clearSession() {
  return withLock(async () => {
    cachedSession = null;
    try {
      if (fs.existsSync(ENCRYPTED_SESSION_PATH)) fs.unlinkSync(ENCRYPTED_SESSION_PATH);
    } catch {
      // ignore
    }
    deleteLegacySessionSync();
    await deleteKeytarSession();
  });
}

module.exports = {
  clearSession,
  encryptedSessionPath: ENCRYPTED_SESSION_PATH,
  getCachedSession,
  legacySessionPath: LEGACY_SESSION_PATH,
  loadSession,
  saveSession,
  toSafeSessionView,
};
