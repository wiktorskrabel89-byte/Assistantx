'use strict';

const logEl = document.getElementById('log');
const emptyEl = document.getElementById('log-empty');

if (logEl && emptyEl) {
  const obs = new MutationObserver(() => {
    emptyEl.hidden = !!logEl.querySelector('.message');
  });
  obs.observe(logEl, { childList: true });
}
