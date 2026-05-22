'use strict';

const MAX_RESPONSE_BYTES = 1024 * 1024 * 4; // 4MB

function stripHtmlToMarkdown(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchWithGuard(url, options = {}) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('web-fetch-invalid-url');
  }
  const response = await fetch(value, {
    method: options.method || 'GET',
    headers: options.headers || {},
  });
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('web-fetch-response-too-large');
  }
  if (!response.ok) {
    throw new Error(`web-fetch-http-${response.status}`);
  }
  return {
    url: value,
    status: response.status,
    contentType,
    content: text,
  };
}

function createBrowserTools() {
  async function fetch_raw(params = {}) {
    const result = await fetchWithGuard(params.url, {});
    return {
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      content: result.content,
    };
  }

  async function fetch_html(params = {}) {
    const result = await fetchWithGuard(params.url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    return {
      url: result.url,
      status: result.status,
      html: result.content,
      contentType: result.contentType,
    };
  }

  async function fetch_markdown(params = {}) {
    const html = await fetch_html(params);
    return {
      url: html.url,
      status: html.status,
      markdown: stripHtmlToMarkdown(html.html),
      contentType: html.contentType,
    };
  }

  async function fetch_text(params = {}) {
    const result = await fetch_raw(params);
    return {
      url: result.url,
      status: result.status,
      content: result.content,
      contentType: result.contentType,
    };
  }

  return {
    fetch: fetch_text,
    fetch_markdown,
    fetch_html,
    fetch_raw,
  };
}

module.exports = {
  createBrowserTools,
};
