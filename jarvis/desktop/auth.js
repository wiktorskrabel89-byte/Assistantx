const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const TOKEN_PATH = path.join(BASE_DIR, 'token.txt');
const KEYTAR_SERVICE = 'AssistantX';
const KEYTAR_ACCOUNT = 'desktop-device-token';

let keytar = null;
try {
  keytar = require('keytar');
} catch {
  keytar = null;
}

let cachedToken = null;

function deleteLegacyTokenSync() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  } catch {
    // ignore cleanup errors
  }
}

function readLegacyTokenSync() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    return token || null;
  } catch {
    return null;
  }
}

async function getToken() {
  if (cachedToken) return cachedToken;
  fs.mkdirSync(BASE_DIR, { recursive: true });

  const legacyToken = readLegacyTokenSync();

  if (keytar) {
    try {
      const storedToken = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      cachedToken = storedToken || legacyToken || generateToken();
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, cachedToken);
      deleteLegacyTokenSync();
      return cachedToken;
    } catch (error) {
      console.warn('[auth] Keytar device token access failed; using memory-only token:', error?.message || error);
    }
  }

  cachedToken = generateToken();
  deleteLegacyTokenSync();
  return cachedToken;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function clearToken() {
  cachedToken = null;
  deleteLegacyTokenSync();
  if (keytar) {
    try {
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    } catch {
      // ignore logout cleanup errors
    }
  }
}

module.exports = {
  getToken,
  clearToken,
  tokenPath: TOKEN_PATH,
};
