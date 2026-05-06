// jarvis/desktop/phone-commands.js
// Natural-language command router for phone-initiated commands.
// Maps Polish and English phrases to structured commands that are
// dispatched back to backend.js for execution.

const { sendMessageToBackend, getCurrentToken } = require('./backend');

// ── App aliases ──────────────────────────────────────────────────────────────
const APP_ALIASES = {
  // Polish → canonical app name
  'roblox': 'roblox',
  'discord': 'discord',
  'spotify': 'spotify',
  'steam': 'steam',
  'chrome': 'chrome',
  'firefox': 'firefox',
  'edge': 'edge',
  'kalkulator': 'calculator',
  'notatnik': 'notepad',
  'eksplorator': 'explorer',
  'menedżer zadań': 'taskmgr',
  'menedzer zadan': 'taskmgr',
  'paint': 'paint',
  'word': 'word',
  'excel': 'excel',
  'teams': 'teams',
  'zoom': 'zoom',
  'vscode': 'vscode',
  'vlc': 'vlc',
};

// ── Phrase patterns ───────────────────────────────────────────────────────────
const PATTERNS = [
  // Open app ─ PL + EN
  {
    regex: /(?:otwórz|odpal|uruchom|otwórzь|open|launch|start)\s+(.+)/i,
    handler: (match) => dispatchCommand('openApp', { app: resolveApp(match[1].trim()) }),
  },
  // Close app
  {
    regex: /(?:zamknij|wyłącz|zabij|close|kill)\s+(.+)/i,
    handler: (match) => dispatchCommand('closeApp', { app: resolveApp(match[1].trim()) }),
  },
  // Open URL
  {
    regex: /(?:otwórz stronę?|idź na|przejdź na|open site|go to|navigate to)\s+(.+)/i,
    handler: (match) => dispatchCommand('openUrl', { url: match[1].trim() }),
  },
  // Search web
  {
    regex: /(?:wyszukaj|znajdź|szukaj|search for|find|google)\s+(.+)/i,
    handler: (match) => dispatchCommand('searchWeb', { query: match[1].trim() }),
  },
  // YouTube
  {
    regex: /(?:youtube|yt)\s+(.+)/i,
    handler: (match) => dispatchCommand('searchYouTube', { query: match[1].trim() }),
  },
  // Screenshot
  {
    regex: /(?:screenshot|zrzut ekranu|pokaż ekran|screen)/i,
    handler: () => dispatchCommand('screenshot'),
  },
  // System info
  {
    regex: /(?:info o systemie|system info|sysinfo|informacje o komputerze)/i,
    handler: () => dispatchCommand('sysinfo'),
  },
  // Processes
  {
    regex: /(?:lista procesów|procesy|processes|top processes)/i,
    handler: () => dispatchCommand('listProcesses'),
  },
  // Volume up
  {
    regex: /(?:głośniej|volume up|zwiększ głośność)/i,
    handler: () => dispatchCommand('volumeUp'),
  },
  // Volume down
  {
    regex: /(?:ciszej|volume down|zmniejsz głośność)/i,
    handler: () => dispatchCommand('volumeDown'),
  },
  // Mute
  {
    regex: /(?:wycisz|mute|wyciszenie)/i,
    handler: () => dispatchCommand('mute'),
  },
  // Lock screen
  {
    regex: /(?:zablokuj|lock(?: screen)?|ekran blokady)/i,
    handler: () => dispatchCommand('lockScreen'),
  },
  // Sleep
  {
    regex: /(?:uśpij|sleep|tryb uśpienia)/i,
    handler: () => dispatchCommand('sleep'),
  },
  // Shutdown
  {
    regex: /(?:wyłącz komputer|shutdown|zamknij system)/i,
    handler: () => dispatchCommand('shutdown'),
  },
  // Restart
  {
    regex: /(?:zrestartuj|restart|uruchom ponownie)/i,
    handler: () => dispatchCommand('restart'),
  },
  // Cancel shutdown
  {
    regex: /(?:anuluj wyłączenie|cancel shutdown)/i,
    handler: () => dispatchCommand('cancelShutdown'),
  },
  // Desktop files
  {
    regex: /(?:pliki na pulpicie|lista pulpit|desktop files)/i,
    handler: () => dispatchCommand('listDesktop'),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveApp(name) {
  const lower = name.toLowerCase();
  return APP_ALIASES[lower] || lower;
}

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
  const normalized = command.trim();
  for (const { regex, handler } of PATTERNS) {
    const match = normalized.match(regex);
    if (match) {
      handler(match);
      return true;
    }
  }
  console.log(`[phone-commands] No pattern matched: "${normalized}"`);
  return false;
}

module.exports = { handlePhoneCommand };

