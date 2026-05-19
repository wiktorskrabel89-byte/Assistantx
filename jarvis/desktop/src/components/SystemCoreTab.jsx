import React, { useEffect, useMemo, useState } from 'react';
import ApprovalCard from './ApprovalCard';
import DisclaimerModal from './DisclaimerModal';
import { useServerMetrics } from '../hooks/useServerMetrics';

export default function SystemCoreTab() {
  const [syncKey, setSyncKey] = useState('');
  const [serverIp, setServerIp] = useState('');
  const [status, setStatus] = useState({ connected: false, autonomyLevel: 'default', pendingCount: 0 });
  const [approvals, setApprovals] = useState([]);
  const [activity, setActivity] = useState([]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const serverApi = useMemo(() => window?.jarvisApi?.server || null, []);
  const metrics = useServerMetrics(serverApi);

  useEffect(() => {
    if (!serverApi) return undefined;
    serverApi.getStatus().then((next) => setStatus(next || status)).catch(() => null);

    const unsubApproval = serverApi.onApprovalRequired((action) => {
      setApprovals((prev) => [action, ...prev]);
    });
    const unsubResolved = serverApi.onApprovalResolved((payload) => {
      setApprovals((prev) => prev.filter((entry) => entry.id !== payload?.id));
    });
    const unsubActivity = serverApi.onActivity((event) => {
      setActivity((prev) => [event, ...prev].slice(0, 100));
      serverApi.getStatus().then((next) => setStatus(next || status)).catch(() => null);
    });

    return () => {
      unsubApproval?.();
      unsubResolved?.();
      unsubActivity?.();
    };
  }, [serverApi]);

  const handlePair = async () => {
    if (!serverApi) return;
    const paired = await serverApi.pair({ serverIp, syncKey });
    if (!paired?.ok) return;
    await serverApi.connect();
    const next = await serverApi.getStatus();
    setStatus(next || status);
  };

  const handleAutonomy = async (level) => {
    if (!serverApi) return;
    if (level === 'full') {
      const consent = await serverApi.getFullControlConsent();
      if (!consent?.accepted) {
        setShowDisclaimer(true);
        return;
      }
    }
    await serverApi.setAutonomy(level);
    const next = await serverApi.getStatus();
    setStatus(next || status);
  };

  return (
    <div className="system-core-container">
      <header className="tab-header">
        <h2>System Core & Node Control</h2>
        <div className={`status-badge ${status.connected ? 'connected' : 'disconnected'}`}>
          {status.connected ? 'SYNCHRONIZED (LINUX SERVER)' : 'UNAUTHORIZED'}
        </div>
      </header>

      <section className="pairing-section">
        <input type="text" placeholder="Server IP" value={serverIp} onChange={(e) => setServerIp(e.target.value)} />
        <input type="password" placeholder="Wprowadź Server Sync Key..." value={syncKey} onChange={(e) => setSyncKey(e.target.value)} />
        <button type="button" onClick={handlePair}>Połącz i Synchronizuj</button>
      </section>

      <section className="permission-matrix">
        <h3>Poziom Autonomii Agenta</h3>
        <div className="button-group">
          <button type="button" className={status.autonomyLevel === 'default' ? 'active' : ''} onClick={() => handleAutonomy('default')}>Default</button>
          <button type="button" className={status.autonomyLevel === 'auto' ? 'active' : ''} onClick={() => handleAutonomy('auto')}>Auto-Accept</button>
          <button type="button" className={status.autonomyLevel === 'full' ? 'active-alert' : ''} onClick={() => handleAutonomy('full')}>Full Control</button>
        </div>
      </section>

      <section className="live-telemetry">
        <h3>Zasoby Serwera (Linux Live)</h3>
        <div className="metric-row"><span>CPU Usage:</span> <strong>{metrics.cpu}%</strong></div>
        <div className="metric-row"><span>VRAM Allocation:</span> <strong>{metrics.vram} GB</strong></div>
      </section>

      <section className="approval-feed">
        {approvals.map((action) => (
          <ApprovalCard
            key={action.id}
            action={action}
            onApprove={(id) => serverApi?.approve(id)}
            onReject={(id) => serverApi?.reject(id)}
          />
        ))}
      </section>

      <section className="activity-feed">
        {activity.map((event, index) => <div key={`${event?.type || 'event'}-${index}`}>{event?.type || 'event'}</div>)}
      </section>

      <button type="button" className="kill-switch-btn" onClick={() => serverApi?.forceDisconnect()}>EMERGENCY CONTROL DISCONNECT</button>

      <DisclaimerModal
        open={showDisclaimer}
        onAccept={async () => {
          await serverApi?.acceptFullControlDisclaimer();
          setShowDisclaimer(false);
          await handleAutonomy('full');
        }}
      />
    </div>
  );
}
