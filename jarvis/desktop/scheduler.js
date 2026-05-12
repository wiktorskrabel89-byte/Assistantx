// jarvis/desktop/scheduler.js
// Cron-style scheduler for Jarvis Desktop.
// Reads schedules from local-state.js and fires them via a callback when due.
// Schedules persist in state.json; use addSchedule/removeSchedule from local-state.js
// to manage them.
//
// cronExpr examples:
//   'every 5 minutes'    — run every N minutes
//   'every 2 hours'      — run every N hours
//   'every 1 day'        — run every N days
//   'daily at 08:30'     — run once a day at a fixed time (24-h clock)

const { getSchedules, parseNextRun, updateScheduleRun } = require('./local-state');

const POLL_INTERVAL_MS = 30_000; // check every 30 seconds

let pollTimer = null;
let onFireCallback = null;

/**
 * Start the scheduler.
 * @param {(schedule: object) => void} onFire — called with the schedule object when it is due
 */
function startScheduler(onFire) {
  if (typeof onFire !== 'function') throw new Error('onFire must be a function');
  onFireCallback = onFire;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  console.log('[scheduler] Started — polling every', POLL_INTERVAL_MS / 1000, 's');
}

/** Stop the scheduler. */
function stopScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log('[scheduler] Stopped');
}

function tick() {
  const now = Date.now();
  const schedules = getSchedules();
  for (const sched of schedules) {
    if (!sched.enabled) continue;
    if (!sched.nextRunAt) continue;
    const due = new Date(sched.nextRunAt).getTime();
    if (due <= now) {
      const nextRunAt = parseNextRun(sched.cronExpr);
      updateScheduleRun(sched.id, nextRunAt);
      console.log(`[scheduler] Firing: ${sched.label || sched.command} → next: ${nextRunAt}`);
      try {
        onFireCallback({ ...sched, firedAt: new Date().toISOString() });
      } catch (err) {
        console.error('[scheduler] onFire error:', err.message);
      }
    }
  }
}

module.exports = { startScheduler, stopScheduler };
