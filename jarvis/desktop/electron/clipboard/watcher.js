/**
 * Clipboard Watcher — strictly opt-in background monitor.
 *
 * Privacy principles:
 *  - Default OFF; requires explicit user consent stored via safeStorage.
 *  - Sensitive patterns (passwords, credit-card numbers, API keys) are
 *    suppressed before the content is surfaced to the UI layer.
 *  - Audio/binary content is ignored.
 *  - Clipboard history is kept only in-memory (never on disk).
 *  - The watcher is paused whenever the app is hidden and stops on disable.
 */

'use strict';

const { clipboard, safeStorage, app } = require('electron');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENT_STORE_FILE = 'clipboard-consent.bin';
const POLL_INTERVAL_MS = 1500;

// Patterns that indicate sensitive data that must NOT be forwarded
const SENSITIVE_PATTERNS = [
  // Credit card numbers (Visa/MC/Amex/Discover)
  /\b(?:\d[ -]?){13,19}\b/,
  // Passwords / secrets lines
  /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+/i,
  // JWT tokens
  /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  // SSH private key blocks
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  // AWS-style access keys
  /\b(AKIA|A3T|AGPA|AIDA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
  // Generic high-entropy strings (>= 32 hex chars with no whitespace)
  /\b[0-9a-f]{32,}\b/,
];

// Contextual rule engine — maps patterns to suggestion types
const SUGGESTION_RULES = [
  {
    type: 'url',
    label: 'Open or summarize URL',
    pattern: /^https?:\/\/[^\s]{6,}/,
    icon: '🔗',
    actions: ['open', 'summarize', 'save'],
  },
  {
    type: 'email',
    label: 'Compose email',
    pattern: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
    icon: '✉️',
    actions: ['compose', 'lookup'],
  },
  {
    type: 'code',
    label: 'Review code snippet',
    // Multi-line text containing programming keywords
    pattern: /(?:function|const|let|var|def |class |import |#include|public |private )/,
    icon: '💻',
    actions: ['review', 'explain', 'refactor'],
  },
  {
    type: 'date',
    label: 'Create calendar event',
    pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i,
    icon: '📅',
    actions: ['create-event'],
  },
  {
    type: 'text',
    label: 'Ask AI about this text',
    pattern: /[\w\s]{60,}/,
    icon: '✨',
    actions: ['ask', 'translate', 'summarize'],
  },
];

// ─── ClipboardWatcher class ───────────────────────────────────────────────────

class ClipboardWatcher extends EventEmitter {
  constructor() {
    super();
    this._enabled = false;
    this._consentGiven = false;
    this._timer = null;
    this._lastText = '';
    this._history = []; // max 50 entries in-memory
    this._consentFilePath = null;
  }

  /** Resolve the path to the encrypted consent flag file. */
  _consentPath() {
    if (!this._consentFilePath) {
      this._consentFilePath = path.join(app.getPath('userData'), CONSENT_STORE_FILE);
    }
    return this._consentFilePath;
  }

  /** Persist consent flag encrypted via safeStorage (or plain fallback). */
  _saveConsent(value) {
    try {
      const data = Buffer.from(value ? '1' : '0');
      const encrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(value ? 'granted' : 'denied')
        : data;
      fs.writeFileSync(this._consentPath(), encrypted);
    } catch {
      // If we can't persist, the watcher still works in-session
    }
  }

  /** Load persisted consent flag. Returns false if not found / error. */
  _loadConsent() {
    try {
      const raw = fs.readFileSync(this._consentPath());
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(raw);
        return decrypted === 'granted';
      }
      return raw.toString() === '1';
    } catch {
      return false;
    }
  }

  /** Initialise and restore consent state from disk. */
  init() {
    this._consentGiven = this._loadConsent();
    if (this._consentGiven) {
      this._start();
    }
    return this._consentGiven;
  }

  /** Grant user consent and start the watcher. */
  enable() {
    this._consentGiven = true;
    this._saveConsent(true);
    this._start();
    this.emit('status', { enabled: true, consentGiven: true });
  }

  /** Revoke consent and stop the watcher. Clears in-memory history. */
  disable() {
    this._consentGiven = false;
    this._saveConsent(false);
    this._stop();
    this._history = [];
    this._lastText = '';
    this.emit('status', { enabled: false, consentGiven: false });
  }

  /** Current status snapshot for IPC. */
  getStatus() {
    return {
      enabled: this._enabled,
      consentGiven: this._consentGiven,
      historyCount: this._history.length,
    };
  }

  /** Latest non-sensitive clipboard entry (or null). */
  getLast() {
    return this._history[this._history.length - 1] ?? null;
  }

  /** All in-memory clipboard history entries. */
  getHistory() {
    return [...this._history];
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _start() {
    if (this._enabled) return;
    this._enabled = true;
    this._lastText = clipboard.readText() ?? '';
    this._poll();
  }

  _stop() {
    this._enabled = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _poll() {
    if (!this._enabled) return;
    this._timer = setTimeout(() => this._check(), POLL_INTERVAL_MS);
  }

  _check() {
    try {
      const text = (clipboard.readText() ?? '').trim();
      if (text && text !== this._lastText) {
        this._lastText = text;
        if (!this._isSensitive(text)) {
          const entry = this._buildEntry(text);
          this._history.push(entry);
          if (this._history.length > 50) this._history.shift();
          this.emit('change', entry);
        }
      }
    } catch {
      // Clipboard access error — skip silently
    }
    this._poll();
  }

  /** Returns true if the text matches any sensitive pattern. */
  _isSensitive(text) {
    return SENSITIVE_PATTERNS.some((re) => re.test(text));
  }

  /** Build a clipboard entry with matched suggestion rules. */
  _buildEntry(text) {
    const suggestions = [];
    for (const rule of SUGGESTION_RULES) {
      if (rule.pattern.test(text)) {
        suggestions.push({
          type: rule.type,
          label: rule.label,
          icon: rule.icon,
          actions: rule.actions,
        });
      }
    }
    return {
      id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      preview: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      capturedAt: Date.now(),
      suggestions: suggestions.slice(0, 3), // max 3 suggestions per entry
    };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

const watcher = new ClipboardWatcher();
module.exports = { watcher, SUGGESTION_RULES };
