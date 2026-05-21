'use strict';

function createGoogleGmail({ auth }) {
  async function api(path, query = {}) {
    const token = await auth.getAccessToken();
    const url = new URL(`https://gmail.googleapis.com/gmail/v1${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `google-gmail-http-${response.status}`);
    return data;
  }

  async function getUnreadThreads(maxResults = 10) {
    const payload = await api('/users/me/threads', {
      q: 'is:unread',
      maxResults: Math.max(1, Math.min(50, Number(maxResults) || 10)),
    });
    return payload?.threads || [];
  }

  async function getMessageHeaders(threadId) {
    const payload = await api(`/users/me/threads/${encodeURIComponent(threadId)}`, {
      format: 'metadata',
      metadataHeaders: 'Subject',
    });
    const first = payload?.messages?.[0] || {};
    const headers = Array.isArray(first?.payload?.headers) ? first.payload.headers : [];
    return {
      threadId,
      subject: headers.find((item) => String(item?.name || '').toLowerCase() === 'subject')?.value || '',
      from: headers.find((item) => String(item?.name || '').toLowerCase() === 'from')?.value || '',
      date: headers.find((item) => String(item?.name || '').toLowerCase() === 'date')?.value || '',
      snippet: first?.snippet || '',
    };
  }

  return {
    getUnreadThreads,
    getMessageHeaders,
  };
}

module.exports = {
  createGoogleGmail,
};
