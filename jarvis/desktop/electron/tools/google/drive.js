'use strict';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const EXPORT_MIMES = {
  'application/vnd.google-apps.document':     'text/plain',
  'application/vnd.google-apps.spreadsheet':  'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

function createGoogleDrive({ auth }) {
  async function api(path, query = {}, opts = {}) {
    const token = await auth.getAccessToken();
    const url = new URL(`${DRIVE_API}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    });
    if (opts.raw) return response;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `google-drive-http-${response.status}`);
    return data;
  }

  async function listFiles({ query = '', pageSize = 20, orderBy = 'modifiedTime desc' } = {}) {
    const data = await api('/files', {
      q: query || undefined,
      pageSize: Math.max(1, Math.min(100, Number(pageSize) || 20)),
      orderBy,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    });
    return data?.files || [];
  }

  async function readFile({ fileId } = {}) {
    if (!fileId) throw new Error('google-drive-file-id-required');
    // Get metadata first to determine MIME type
    const meta = await api(`/files/${encodeURIComponent(fileId)}`, {
      fields: 'id,name,mimeType',
    });
    const exportMime = EXPORT_MIMES[meta.mimeType];
    if (exportMime) {
      // Google Workspace file — export as text
      const response = await api(
        `/files/${encodeURIComponent(fileId)}/export`,
        { mimeType: exportMime },
        { raw: true },
      );
      const text = await response.text();
      return { id: meta.id, name: meta.name, mimeType: exportMime, content: text };
    }
    // Binary / plain text — download directly
    const response = await api(
      `/files/${encodeURIComponent(fileId)}`,
      { alt: 'media' },
      { raw: true },
    );
    const text = await response.text();
    return { id: meta.id, name: meta.name, mimeType: meta.mimeType, content: text };
  }

  async function listShared({ pageSize = 20 } = {}) {
    return listFiles({
      query: "sharedWithMe = true and trashed = false",
      pageSize,
    });
  }

  return {
    listFiles,
    readFile,
    listShared,
  };
}

module.exports = {
  createGoogleDrive,
};
