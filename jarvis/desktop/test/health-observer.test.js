'use strict';

// M-Test — health-observer pub/sub + snapshot contract (M6 backing).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHealthObserver } = require('../electron/diagnostics/health-observer');

test('health-observer: snapshot starts with all subsystems unknown', () => {
  const observer = createHealthObserver();
  const snap = observer.snapshot();
  assert.ok(snap.timestamp);
  assert.equal(snap.subsystems.sidecar.status, 'unknown');
  assert.equal(snap.subsystems.ollama.status, 'unknown');
  assert.equal(snap.subsystems.network.status, 'unknown');
});

test('health-observer: probe drives a pulse + change event', async () => {
  const observer = createHealthObserver({ probeTimeoutMs: 1000 });
  let pulseSeen = null;
  let changeSeen = null;
  observer.on('pulse', (e) => { pulseSeen = e; });
  observer.on('change', (e) => { changeSeen = e; });
  observer.registerProbe('sidecar', () => ({ status: 'healthy', detail: 'ok-1' }));
  await observer.runOnce();
  assert.equal(pulseSeen?.subsystem, 'sidecar');
  assert.equal(pulseSeen?.status, 'healthy');
  assert.equal(changeSeen?.status, 'healthy');
  assert.equal(observer.snapshot().subsystems.sidecar.status, 'healthy');
});

test('health-observer: degraded probe triggers healer once per cooldown', async () => {
  const observer = createHealthObserver({ probeTimeoutMs: 1000, cooldownMs: 60_000 });
  let healCalls = 0;
  observer.registerProbe('sidecar', () => ({ status: 'unavailable', detail: 'crashed' }));
  observer.registerHealer('sidecar', () => { healCalls += 1; });
  await observer.runOnce();
  await observer.runOnce(); // second pulse inside cooldown — should NOT re-heal
  assert.equal(healCalls, 1);
});

test('health-observer: probe timeout surfaces as unavailable', async () => {
  const observer = createHealthObserver({ probeTimeoutMs: 50 });
  observer.registerProbe('ollama', () => new Promise(() => {})); // never resolves
  await observer.runOnce();
  assert.equal(observer.snapshot().subsystems.ollama.status, 'unavailable');
});
