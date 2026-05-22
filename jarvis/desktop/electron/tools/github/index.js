'use strict';

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const TOKEN_FILE = 'github-token.bin';

function ensureSafeStorageAvailable() {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage-encryption-unavailable');
  }
}

function decodeContent(payload) {
  const encoding = String(payload?.encoding || '').toLowerCase();
  const raw = String(payload?.content || '');
  if (encoding !== 'base64') return raw;
  return Buffer.from(raw.replace(/\n/g, ''), 'base64').toString('utf-8');
}

function createGitHubClient({ app }) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('electron-app-required');
  }

  const tokenPath = path.join(app.getPath('userData'), TOKEN_FILE);

  async function api(pathname, { method = 'GET', token, query, body } = {}) {
    const url = new URL(`https://api.github.com${pathname}`);
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
      });
    }
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `AssistantX/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    if (!response.ok) {
      throw new Error(parsed?.message || `github-http-${response.status}`);
    }
    return parsed;
  }

  function setToken(token) {
    const normalized = String(token || '').trim();
    if (!normalized) throw new Error('token-required');
    if (normalized.length > 5000) throw new Error('token-too-long');
    ensureSafeStorageAvailable();
    const encrypted = safeStorage.encryptString(normalized);
    fs.writeFileSync(tokenPath, encrypted.toString('base64'), 'utf8');
    return { ok: true };
  }

  function clearToken() {
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    return { ok: true };
  }

  function getToken() {
    ensureSafeStorageAvailable();
    if (!fs.existsSync(tokenPath)) return '';
    const encoded = String(fs.readFileSync(tokenPath, 'utf8') || '').trim();
    if (!encoded) return '';
    const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    return String(decrypted || '').trim();
  }

  function hasToken() {
    try {
      return Boolean(getToken());
    } catch {
      return false;
    }
  }

  async function getStatus() {
    const token = getToken();
    if (!token) return { connected: false, hasToken: false };
    try {
      const user = await api('/user', { token });
      return {
        connected: true,
        hasToken: true,
        login: user?.login || null,
        id: user?.id || null,
      };
    } catch (error) {
      return {
        connected: false,
        hasToken: true,
        error: String(error?.message || error || 'github-status-failed'),
      };
    }
  }

  async function listRepos({ user, perPage = 50 } = {}) {
    const token = getToken();
    const pathname = user ? `/users/${encodeURIComponent(user)}/repos` : '/user/repos';
    return api(pathname, {
      token,
      query: { sort: 'updated', per_page: Math.max(1, Math.min(100, Number(perPage) || 50)) },
    });
  }

  async function readFile({ owner, repo, filePath, ref } = {}) {
    const token = getToken();
    const payload = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`, {
      token,
      query: { ref: ref || undefined },
    });
    return {
      path: payload?.path || filePath,
      name: payload?.name || null,
      sha: payload?.sha || null,
      size: payload?.size || 0,
      content: decodeContent(payload),
    };
  }

  async function listCommits({ owner, repo, perPage = 20 } = {}) {
    const token = getToken();
    return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`, {
      token,
      query: { per_page: Math.max(1, Math.min(100, Number(perPage) || 20)) },
    });
  }

  async function getCommitDiff({ owner, repo, sha } = {}) {
    const token = getToken();
    return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`, {
      token,
    });
  }

  async function getRepoTree({ owner, repo, branch = 'HEAD' } = {}) {
    const token = getToken();
    let treeSha = '';
    const normalizedBranch = branch && branch !== 'HEAD' ? branch : '';
    if (normalizedBranch) {
      const ref = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(normalizedBranch)}`, { token });
      treeSha = String(ref?.object?.sha || '');
    }
    if (!treeSha) {
      const repoMeta = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });
      const defaultBranch = String(repoMeta?.default_branch || 'main');
      const ref = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, { token });
      treeSha = String(ref?.object?.sha || '');
    }
    if (!treeSha) throw new Error('github-tree-sha-missing');
    const tree = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}`, {
      token,
      query: { recursive: '1' },
    });
    return tree?.tree || [];
  }

  return {
    setToken,
    clearToken,
    hasToken,
    getStatus,
    listRepos,
    readFile,
    listCommits,
    getCommitDiff,
    getRepoTree,
  };
}

module.exports = {
  createGitHubClient,
};
