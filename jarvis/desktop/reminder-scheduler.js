'use strict';

const {
  getReminders,
  markReminderCompleted,
  markReminderFired,
} = require('./local-state');

const POLL_INTERVAL_MS = 30_000;
let timer = null;
let onReminder = null;

function startReminderScheduler(callback) {
  if (typeof callback !== 'function') throw new Error('onReminder must be a function');
  onReminder = callback;
  if (timer) clearInterval(timer);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

function tick() {
  const now = Date.now();
  const reminders = getReminders();
  for (const reminder of reminders) {
    if (reminder.completed) continue;
    if (reminder.firedAt) continue;
    const dueAt = new Date(reminder.triggerAt).getTime();
    if (!Number.isFinite(dueAt)) continue;
    if (dueAt > now) continue;
    markReminderFired(reminder.id, new Date().toISOString());
    try {
      onReminder({ ...reminder });
      if (reminder.autoComplete) markReminderCompleted(reminder.id, true);
    } catch {
      // no-op
    }
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
};
