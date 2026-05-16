'use strict';

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
let cachedSession = null;
let lock = Promise.resolve();

function withLock(task) {
  const next = lock.then(task, task);
  lock = next.then(() => undefined, () => undefined);
  return next;
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

function deleteEncryptedCacheSync() {
  try {
    if (fs.existsSync(ENCRYPTED_SESSION_PATH)) fs.unlinkSync(ENCRYPTED_SESSION_PATH);
  } catch {
    // ignore
  }
}

async function persistKeytarSession(session) {
  if (!keytar) {
    console.warn('[auth][session] Keytar is unavailable; session will not persist after restart.');
    return false;
  }
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
  cachedSession = null;
  return cachedSession;
}

async function loadSession() {
  return withLock(async () => {
    const keytarSession = await readKeytarSession();
    if (keytarSession) {
      cachedSession = normalizeSession({ ...keytarSession, version: SESSION_VERSION });
      deleteEncryptedCacheSync();
      deleteLegacySessionSync();
      return cachedSession ? { ...cachedSession } : null;
    }

    const legacy = readLegacySessionSync();
    if (legacy) {
      cachedSession = normalizeSession({ ...legacy, version: SESSION_VERSION });
      await persistKeytarSession(cachedSession);
      deleteLegacySessionSync();
      deleteEncryptedCacheSync();
      return { ...cachedSession };
    }

    deleteEncryptedCacheSync();
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
    await persistKeytarSession(normalized);
    deleteEncryptedCacheSync();
    deleteLegacySessionSync();
    return { ...normalized };
  });
}

async function clearSession() {
  return withLock(async () => {
    cachedSession = null;
    deleteEncryptedCacheSync();
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
