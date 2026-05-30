'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
let electron = null;
try {
  electron = require('electron');
} catch {
  electron = null;
}

const KEYTAR_SERVICE = 'AssistantX';
const STORE_FILE_NAME = 'byok-keys.dat';
const PROVIDER_TO_KEYTAR_ACCOUNT = {
  openrouter: 'openrouter-api-key',
  anthropic: 'anthropic-api-key',
  openai: 'openai-api-key',
};

function normalizeProvider(provider) {
  return String(provider || '').trim().toLowerCase();
}

function getAccountName(provider) {
  const normalized = normalizeProvider(provider);
  return PROVIDER_TO_KEYTAR_ACCOUNT[normalized] || `${normalized}-api-key`;
}

function canEncrypt() {
  return Boolean(electron?.safeStorage && electron.safeStorage.isEncryptionAvailable());
}

function getStoreFilePath() {
  const userData = electron?.app?.getPath?.('userData') || path.join(os.tmpdir(), 'assistantx-test-userdata');
  return path.join(userData, STORE_FILE_NAME);
}

function readSafeStorageFile(filePath) {
  if (!canEncrypt() || !fs.existsSync(filePath)) return {};
  try {
    const payload = fs.readFileSync(filePath, 'utf8').trim();
    if (!payload) return {};
    const decrypted = electron.safeStorage.decryptString(Buffer.from(payload, 'base64'));
    const parsed = JSON.parse(String(decrypted || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSafeStorageFile(filePath, data) {
  if (!canEncrypt()) return { ok: false, reason: 'safeStorage-encryption-unavailable' };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encrypted = electron.safeStorage.encryptString(JSON.stringify(data || {}));
    fs.writeFileSync(filePath, encrypted.toString('base64'), 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
}

function getKeytarClient() {
  try {
    return require('keytar');
  } catch {
    return null;
  }
}

function createByokKeyStore() {
  const filePath = getStoreFilePath();

  async function set(provider, value) {
    const normalizedProvider = normalizeProvider(provider);
    const token = String(value || '').trim();
    if (!normalizedProvider || !token) {
      return { ok: false, reason: 'provider-and-value-required' };
    }

    const keytar = getKeytarClient();
    if (keytar) {
      try {
        await keytar.setPassword(KEYTAR_SERVICE, getAccountName(normalizedProvider), token);
        return { ok: true, backend: 'keytar', key_alias: getAccountName(normalizedProvider) };
      } catch {
        // fallback to safeStorage file
      }
    }

    const current = readSafeStorageFile(filePath);
    current[normalizedProvider] = token;
    const saved = writeSafeStorageFile(filePath, current);
    return { ...saved, backend: 'safeStorage', key_alias: getAccountName(normalizedProvider) };
  }

  async function get(provider) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) return '';

    const keytar = getKeytarClient();
    if (keytar) {
      try {
        const token = await keytar.getPassword(KEYTAR_SERVICE, getAccountName(normalizedProvider));
        if (token) return String(token);
      } catch {
        // fallback
      }
    }

    const current = readSafeStorageFile(filePath);
    return String(current[normalizedProvider] || '');
  }

  async function clear(provider) {
    const normalizedProvider = normalizeProvider(provider);
    if (!normalizedProvider) return { ok: false, reason: 'provider-required' };

    const keytar = getKeytarClient();
    if (keytar) {
      try {
        await keytar.deletePassword(KEYTAR_SERVICE, getAccountName(normalizedProvider));
      } catch {
        // continue with safeStorage cleanup anyway
      }
    }

    const current = readSafeStorageFile(filePath);
    if (Object.prototype.hasOwnProperty.call(current, normalizedProvider)) {
      delete current[normalizedProvider];
      const saved = writeSafeStorageFile(filePath, current);
      if (!saved.ok) return saved;
    }
    return { ok: true };
  }

  return {
    set,
    get,
    clear,
    getKeyAlias: (provider) => getAccountName(provider),
  };
}

module.exports = {
  createByokKeyStore,
  normalizeProvider,
  getAccountName,
};
