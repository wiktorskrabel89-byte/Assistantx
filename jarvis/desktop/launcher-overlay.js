// All IPC with the main process is via window.launcherIpc (provided by
// launcher-preload.js). nodeIntegration is disabled for this window.
const ipc = window.launcherIpc;

const queryInput = document.getElementById('query');
const resultsNode = document.getElementById('results');
const providerStatusNode = document.getElementById('provider-status');
const footerStatusNode = document.getElementById('footer-status');
const voiceStatusNode = document.getElementById('voice-status');
const refreshButton = document.getElementById('refresh');
const installEverythingButton = document.getElementById('install-everything');
const confirmationNode = document.getElementById('confirmation');
const confirmationTitleNode = document.getElementById('confirmation-title');
const confirmationMessageNode = document.getElementById('confirmation-message');
const confirmationApproveButton = document.getElementById('confirmation-approve');
const confirmationCancelButton = document.getElementById('confirmation-cancel');

let items = [];
let activeIndex = 0;
let pendingConfirmationId = null;
let searchTimer = null;

function setProviderStatus(providerStatus = []) {
  const everything = providerStatus.find((entry) => entry.provider === 'everything');
  if (everything?.status === 'available') {
    providerStatusNode.textContent = 'Everything Search active';
    installEverythingButton.classList.add('hidden');
    return;
  }
  const fallback = providerStatus.find((entry) => entry.provider === 'windows-fallback');
  providerStatusNode.textContent = fallback ? 'SQLite fallback index active' : 'Search backend unavailable';
  installEverythingButton.classList.remove('hidden');
}

function renderResults() {
  resultsNode.innerHTML = '';
  if (!items.length) {
    resultsNode.innerHTML = '<button type="button" class="item"><span><span class="item-name">No results yet</span><span class="item-meta">Try another app name or refresh the local index.</span></span></button>';
    return;
  }
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `item${index === activeIndex ? ' active' : ''}`;
    button.innerHTML = `
      <span>
        <span class="item-name">${item.name}</span>
        <span class="item-meta">${item.subtitle || item.sourceProvider || 'launcher result'}</span>
      </span>
      <span class="item-risk">${item.riskLevel !== 'safe' ? item.riskLevel : ''}</span>
    `;
    button.addEventListener('click', () => {
      activeIndex = index;
      renderResults();
      void launchActiveItem();
    });
    resultsNode.appendChild(button);
  });
}

async function runSearch(query = '') {
  const payload = await ipc.invoke('launcher-search', { query, limit: 8 });
  items = payload.results || [];
  activeIndex = 0;
  setProviderStatus(payload.providerStatus || []);
  footerStatusNode.textContent = query
    ? `Showing ${items.length} result${items.length === 1 ? '' : 's'} for “${query}”.`
    : 'Recent apps and launcher suggestions.';
  renderResults();
}

async function refreshIndex() {
  footerStatusNode.textContent = 'Refreshing local launcher index…';
  const result = await ipc.invoke('launcher-refresh');
  setProviderStatus(result.statuses || []);
  footerStatusNode.textContent = `Indexed ${result.appCount} launcher entries via ${result.provider}.`;
  await runSearch(queryInput.value.trim());
}

async function launchActiveItem() {
  const item = items[activeIndex];
  const query = item?.key || queryInput.value.trim();
  if (!query) return;
  const result = await ipc.invoke('launcher-launch', { key: item?.key, query });
  footerStatusNode.textContent = result.summary || `Opened ${item?.name || query}.`;
  if (result.status === 'launched') {
    queryInput.value = '';
    await ipc.invoke('launcher-hide');
  }
}

function showConfirmation(payload) {
  pendingConfirmationId = payload.id;
  confirmationTitleNode.textContent = payload.title || 'Confirm launch';
  confirmationMessageNode.textContent = payload.message || 'Do you want to continue?';
  confirmationNode.classList.add('visible');
}

function clearConfirmation() {
  pendingConfirmationId = null;
  confirmationNode.classList.remove('visible');
}

queryInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runSearch(queryInput.value.trim());
  }, 70);
});

queryInput.addEventListener('keydown', (event) => {
  if (pendingConfirmationId) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex = Math.min(activeIndex + 1, Math.max(items.length - 1, 0));
    renderResults();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    renderResults();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void launchActiveItem();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    void ipc.invoke('launcher-hide');
  }
});

refreshButton.addEventListener('click', () => {
  void refreshIndex();
});

installEverythingButton.addEventListener('click', () => {
  footerStatusNode.textContent = 'Opening Everything Search download page…';
  void ipc.invoke('install-everything-search');
});

confirmationApproveButton.addEventListener('click', () => {
  if (!pendingConfirmationId) return;
  void ipc.invoke('launcher-confirmation-response', { id: pendingConfirmationId, approved: true });
  clearConfirmation();
});

confirmationCancelButton.addEventListener('click', () => {
  if (!pendingConfirmationId) return;
  void ipc.invoke('launcher-confirmation-response', { id: pendingConfirmationId, approved: false });
  clearConfirmation();
});

ipc.on('launcher-overlay-focus', (payload) => {
  if (payload?.providerStatus) setProviderStatus(payload.providerStatus);
  queryInput.focus();
  queryInput.select();
  void runSearch(queryInput.value.trim());
});

ipc.on('launcher-confirmation-request', (payload) => {
  showConfirmation(payload);
});

ipc.on('launcher-confirmation-cleared', () => {
  clearConfirmation();
});

ipc.on('sidecar-status', (payload) => {
  voiceStatusNode.textContent = `Voice sidecar: ${payload?.status || 'unknown'}`;
});

void ipc.invoke('launcher-recent', { limit: 8 }).then((payload) => {
  items = payload.results || [];
  setProviderStatus(payload.providerStatus || []);
  renderResults();
});
