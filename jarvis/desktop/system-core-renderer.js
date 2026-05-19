'use strict';

(function bootstrapSystemCore() {
  const api = window.jarvisApi?.server;
  if (!api) return;

  const statusBadge = document.getElementById('sync-status');
  const pairResult = document.getElementById('pair-result');
  const serverIpInput = document.getElementById('server-ip');
  const syncKeyInput = document.getElementById('sync-key');
  const pairButton = document.getElementById('pair-btn');
  const approvalsNode = document.getElementById('approvals');
  const activityNode = document.getElementById('activity-log');
  const disconnectBtn = document.getElementById('emergency-disconnect');
  const cpuValue = document.getElementById('cpu-value');
  const cpuBar = document.getElementById('cpu-bar');
  const vramValue = document.getElementById('vram-value');
  const vramBar = document.getElementById('vram-bar');
  const disclaimerEl = document.getElementById('disclaimer');
  const acceptDisclaimerBtn = document.getElementById('accept-disclaimer');

  const approvals = new Map();
  let metricsTimer = null;

  function pushActivity(line) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
    activityNode.prepend(item);
    while (activityNode.children.length > 40) {
      activityNode.removeChild(activityNode.lastChild);
    }
  }

  function renderStatus(status) {
    const connected = Boolean(status?.connected);
    statusBadge.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
    statusBadge.textContent = connected ? 'SYNCHRONIZED (LINUX SERVER)' : 'UNAUTHORIZED';

    document.querySelectorAll('[data-autonomy]').forEach((button) => {
      const level = button.getAttribute('data-autonomy');
      button.classList.remove('active', 'active-alert');
      if (level === status?.autonomyLevel) {
        button.classList.add(level === 'full' ? 'active-alert' : 'active');
      }
    });
  }

  function renderApprovals() {
    approvalsNode.innerHTML = '';
    if (approvals.size === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No pending approvals.';
      empty.className = 'tiny';
      approvalsNode.appendChild(empty);
      return;
    }

    for (const [id, action] of approvals.entries()) {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `<div><strong>${action.command}</strong></div><div class="tiny">${action.reason}</div>`;

      const actions = document.createElement('div');
      actions.className = 'actions';
      const approveBtn = document.createElement('button');
      approveBtn.textContent = 'Approve';
      approveBtn.onclick = async () => {
        await api.approve(id);
      };
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'danger';
      rejectBtn.textContent = 'Reject';
      rejectBtn.onclick = async () => {
        await api.reject(id);
      };
      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      item.appendChild(actions);
      approvalsNode.appendChild(item);
    }
  }

  async function refreshStatus() {
    try {
      const status = await api.getStatus();
      renderStatus(status);
    } catch {
      // ignore
    }
  }

  async function refreshMetrics() {
    try {
      const status = await api.getStatus();
      if (!status.connected) return;
      const metrics = await api.execTool('get_metrics', {});
      if (!metrics) return;
      const cpu = Number(metrics.cpu || 0);
      const vram = Number(metrics.vram || 0);
      cpuValue.textContent = `${cpu.toFixed(1)}%`;
      cpuBar.style.width = `${Math.max(0, Math.min(100, cpu))}%`;
      vramValue.textContent = `${vram.toFixed(2)} GB`;
      vramBar.style.width = `${Math.max(0, Math.min(100, vram * 8))}%`;
    } catch {
      // ignore
    }
  }

  pairButton?.addEventListener('click', async () => {
    const serverIp = String(serverIpInput.value || '').trim();
    const syncKey = String(syncKeyInput.value || '').trim();
    if (!serverIp || !syncKey) {
      pairResult.textContent = 'Server IP and Sync Key are required.';
      return;
    }

    pairResult.textContent = 'Pairing...';
    try {
      const paired = await api.pair({ serverIp, syncKey });
      if (!paired?.ok) {
        pairResult.textContent = `Pairing failed: ${paired?.error || 'unknown'}`;
        return;
      }
      const connected = await api.connect();
      pairResult.textContent = connected?.ok ? 'Connected.' : `Connect failed: ${connected?.error || 'unknown'}`;
      await refreshStatus();
      await refreshMetrics();
    } catch (error) {
      pairResult.textContent = `Pairing error: ${error?.message || 'unknown'}`;
    }
  });

  document.querySelectorAll('[data-autonomy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = button.getAttribute('data-autonomy');
      if (target === 'full') {
        const consent = await api.getFullControlConsent();
        if (!consent?.accepted) {
          disclaimerEl.classList.add('open');
          return;
        }
      }
      const response = await api.setAutonomy(target);
      if (!response?.ok && response?.error) {
        pushActivity(`autonomy update rejected: ${response.error}`);
      }
      await refreshStatus();
    });
  });

  acceptDisclaimerBtn?.addEventListener('click', async () => {
    await api.acceptFullControlDisclaimer();
    disclaimerEl.classList.remove('open');
    const response = await api.setAutonomy('full');
    if (!response?.ok && response?.error) {
      pushActivity(`autonomy update rejected: ${response.error}`);
    }
    await refreshStatus();
  });

  disconnectBtn?.addEventListener('click', async () => {
    const confirmed = window.confirm('Disconnect from Linux server and revoke all pending actions?');
    if (!confirmed) return;
    await api.forceDisconnect();
    await refreshStatus();
  });

  api.onApprovalRequired((action) => {
    approvals.set(action.id, action);
    renderApprovals();
    pushActivity(`approval required: ${action.command}`);
  });

  api.onActivity((event) => {
    if (event?.type === 'tool-finished' && event?.payload?.ok !== true) {
      pushActivity(`tool failed: ${event?.payload?.tool} (${event?.payload?.error || 'unknown'})`);
    } else if (event?.type === 'tool-finished') {
      pushActivity(`tool finished: ${event?.payload?.tool}`);
    } else if (event?.type) {
      pushActivity(`${event.type}`);
    }
  });

  api.onApprovalResolved((payload) => {
    approvals.delete(payload?.id);
    renderApprovals();
  });

  metricsTimer = setInterval(() => {
    void refreshMetrics();
  }, 1000);

  window.addEventListener('beforeunload', () => {
    if (metricsTimer) clearInterval(metricsTimer);
  });

  void refreshStatus();
  renderApprovals();
})();
