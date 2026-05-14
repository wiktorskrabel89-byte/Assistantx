// jarvis/desktop/phone-commands.js
// Natural-language command router for phone-initiated commands.
// Maps Polish and English phrases to structured commands that are
// dispatched back to backend.js for execution.

const { sendMessageToBackend, getCurrentToken } = require('./backend');
const { planPrompt } = require('./task-planner');
const { getFavoriteApp } = require('./local-state');

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatchCommand(command, extra = {}) {
  // Include the current device token so the backend can authorise the command,
  // matching the behaviour of other senders (quick-action buttons, Android sendCommand).
  const token = getCurrentToken();
  const sent = sendMessageToBackend({ type: 'command', command, token, ...extra });
  if (!sent) {
    // Backend not connected — execute locally via handleCommand in backend.js
    const { handleCommand: handle } = require('./backend');
    if (typeof handle === 'function') {
      handle({ command, ...extra });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Route a natural-language phone command.
 * @param {string} command - The text from the phone user.
 * @returns {boolean} true if a pattern matched, false otherwise.
 */
function handlePhoneCommand(command) {
  const normalized = String(command || '').trim();
  const plan = planPrompt(normalized, { favoriteApp: getFavoriteApp() });
  if (!plan.steps.length) {
    console.log(`[phone-commands] No pattern matched: "${normalized}"`);
    return false;
  }
  for (const step of plan.steps) {
    const payload = { ...step };
    delete payload.command;
    delete payload.label;
    dispatchCommand(step.command, payload);
  }
  return true;
}

module.exports = { handlePhoneCommand };
