'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 Health Observer — a background diagnostic worker per Section 4:
 *   "robust diagnostic background worker that parses Windows Event Logs and
 *    monitors IPC channels. If the FastAPI backend and Electron frontend
 *    experience a login or connection drop, the app must automatically
 *    self-diagnose and attempt to self-heal the IPC bridge without
 *    crashing the user experience."
 *
 * Design:
 *   - Observer pattern. Subscribers register handlers; the observer fans
 *     pulse events out without coupling to any specific UI component.
 *   - Periodic probes (every 10s by default) check Ollama daemon liveness
 *     and sidecar stdio responsiveness.
 *   - Each subsystem has its own state (healthy / degraded / unavailable)
 *     and a self-heal hook the caller registers (we don't restart processes
 *     directly — we ASK main to do it).
 *   - Throttled. After triggering a heal, the observer waits at least
 *     `cooldownMs` before another heal attempt for the same subsystem so we
 *     don't thrash if recovery is genuinely impossible.
 */

const EventEmitter = require('events');

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

function createHealthObserver({
  intervalMs = DEFAULT_INTERVAL_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const emitter = new EventEmitter();
  const state = {
    sidecar: { status: 'unknown', lastChange: 0, lastHealAt: 0 },
    ollama: { status: 'unknown', lastChange: 0, lastHealAt: 0 },
    network: { status: 'unknown', lastChange: 0, lastHealAt: 0 },
  };
  const probes = {};
  const healers = {};
  let timer = null;
  let running = false;

  function registerProbe(subsystem, probeFn) {
    probes[subsystem] = probeFn;
  }

  function registerHealer(subsystem, healFn) {
    healers[subsystem] = healFn;
  }

  function setStatus(subsystem, status, detail) {
    const subsystemState = state[subsystem] || (state[subsystem] = { status: 'unknown', lastChange: 0, lastHealAt: 0 });
    if (subsystemState.status !== status) {
      subsystemState.status = status;
      subsystemState.lastChange = Date.now();
      emitter.emit('change', { subsystem, status, detail, timestamp: subsystemState.lastChange });
    }
    emitter.emit('pulse', { subsystem, status, detail, timestamp: Date.now() });
    // Self-heal trigger — only if degraded/unavailable and outside cooldown.
    if ((status === 'unavailable' || status === 'degraded') && healers[subsystem]) {
      const sinceLastHeal = Date.now() - subsystemState.lastHealAt;
      if (sinceLastHeal >= cooldownMs) {
        subsystemState.lastHealAt = Date.now();
        log(`[health] triggering self-heal for ${subsystem} (status=${status}, detail=${detail || 'n/a'})`);
        // Emit BEFORE the healer runs so the UI shows the attempt
        // immediately. We additionally emit 'heal-outcome' once the
        // healer's promise resolves/rejects so observers can show the
        // real result — not a guess based on timing.
        emitter.emit('heal-attempted', { subsystem, status, timestamp: Date.now() });
        let healerPromise;
        try {
          healerPromise = Promise.resolve(healers[subsystem]({ subsystem, status, detail }));
        } catch (err) {
          log(`[health] healer for ${subsystem} threw sync:`, err?.message || err);
          emitter.emit('heal-outcome', { subsystem, ok: false, error: String(err?.message || err), timestamp: Date.now() });
          return;
        }
        healerPromise
          .then(() => emitter.emit('heal-outcome', { subsystem, ok: true, timestamp: Date.now() }))
          .catch((err) => {
            log(`[health] healer for ${subsystem} threw:`, err?.message || err);
            emitter.emit('heal-outcome', { subsystem, ok: false, error: String(err?.message || err), timestamp: Date.now() });
          });
      }
    }
  }

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      for (const [subsystem, probeFn] of Object.entries(probes)) {
        try {
          const result = await Promise.race([
            Promise.resolve(probeFn()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('probe-timeout')), probeTimeoutMs)),
          ]);
          if (!result || typeof result !== 'object') {
            setStatus(subsystem, 'unknown', 'probe-returned-non-object');
            continue;
          }
          setStatus(subsystem, result.status || 'unknown', result.detail);
        } catch (err) {
          setStatus(subsystem, 'unavailable', String(err?.message || err));
        }
      }
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    log(`[health] observer starting (interval=${intervalMs}ms)`);
    runOnce().catch(() => null);
    timer = setInterval(() => {
      runOnce().catch(() => null);
    }, intervalMs);
    // Don't keep the event loop alive solely for the observer.
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    log('[health] observer stopped');
  }

  function snapshot() {
    return {
      timestamp: Date.now(),
      subsystems: Object.fromEntries(
        Object.entries(state).map(([key, val]) => [
          key,
          { status: val.status, lastChange: val.lastChange, lastHealAt: val.lastHealAt },
        ]),
      ),
    };
  }

  return {
    registerProbe,
    registerHealer,
    start,
    stop,
    runOnce,
    snapshot,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}

module.exports = { createHealthObserver };
