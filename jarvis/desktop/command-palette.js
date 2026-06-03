'use strict';

/* ARCHITECT'S NOTE: INNOVATION
 * V2.0 predictive command palette — Ctrl+K opens a fuzzy launcher that
 * blends:
 *   1. Static actions (open settings, restart sidecar, toggle voice…)
 *   2. Recent prompts (persisted in localStorage for cross-launch recall)
 *   3. Predictive suggestions based on current UI context (active tab,
 *      mic state, last sidecar event) — e.g. if the orb is listening,
 *      "Stop voice" surfaces first; if a repo was just opened, "Review
 *      PRs in this repo" shows up.
 *
 * Patterns used:
 *   - Observer: subscribes to a small set of context signals exposed on
 *     window.jarvisContext (set by renderer.js as side-effects happen).
 *   - Strategy: pluggable result providers (`buildProviders()`) so future
 *     features can register new sources without touching the core.
 *   - Singleton: one palette instance per renderer; idempotent install().
 */

(function () {
  if (typeof window === 'undefined') return;
  if (window.__jarvisCommandPaletteInstalled) return;
  window.__jarvisCommandPaletteInstalled = true;

  const RECENT_PROMPTS_KEY = 'jarvis.commandPalette.recent';
  const MAX_RECENT = 20;
  const SHARED_CTX = (window.jarvisContext = window.jarvisContext || {});

  // ─── Static commands ──────────────────────────────────────────────────────
  const STATIC_COMMANDS = [
    {
      id: 'cmd:settings',
      icon: '⚙️',
      title: 'Open Settings',
      subtitle: 'Models, voice, account',
      kbd: '',
      run() {
        document.getElementById('settings-tab-button')?.click();
        document.body.classList.remove('tabs-collapsed');
      },
    },
    {
      id: 'cmd:command-log',
      icon: '📝',
      title: 'Open Command Log',
      subtitle: 'Conversation + orb',
      run() { document.getElementById('command-tab-button')?.click(); },
    },
    {
      id: 'cmd:toggle-tabs',
      icon: '☰',
      title: 'Toggle Tab Rail',
      subtitle: 'Show / hide the left navigation',
      kbd: 'Ctrl+B',
      run() { document.getElementById('tab-rail-toggle')?.click(); },
    },
    {
      id: 'cmd:toggle-task-list',
      icon: '⚡',
      title: 'Toggle Task List',
      subtitle: 'Show / hide agent activity stream',
      kbd: 'Ctrl+J',
      run() { document.getElementById('task-list-toggle')?.click(); },
    },
    {
      id: 'cmd:talk',
      icon: '🎙',
      title: 'Talk to Jarvis',
      subtitle: 'Start voice input',
      run() { document.getElementById('voice-input')?.click(); },
    },
    {
      id: 'cmd:focus-input',
      icon: '⌨️',
      title: 'Focus Prompt Input',
      subtitle: 'Jump to the chat composer',
      run() { document.getElementById('input')?.focus(); },
    },
    {
      id: 'cmd:restart-sidecar',
      icon: '🔄',
      title: 'Restart AI Runtime',
      subtitle: 'Force a clean Python sidecar restart',
      async run() {
        try {
          if (window.jarvisIpc?.invoke) {
            await window.jarvisIpc.invoke('restart-sidecar');
          }
        } catch (err) { console.warn('[palette] restart-sidecar failed', err); }
      },
    },
    {
      id: 'cmd:check-updates',
      icon: '⬆',
      title: 'Check for Updates',
      subtitle: 'Background updater check',
      async run() {
        try {
          if (window.jarvisIpc?.invoke) {
            await window.jarvisIpc.invoke('check-for-updates');
          }
        } catch (err) { console.warn('[palette] check-for-updates failed', err); }
      },
    },
    {
      id: 'cmd:devtools',
      icon: '🛠',
      title: 'Toggle DevTools',
      subtitle: 'Inspect the renderer',
      run() {
        try { window.jarvisIpc?.invoke?.('toggle-devtools'); } catch { /* not allowed */ }
      },
    },
  ];

  // ─── Context-aware predictive suggestions ────────────────────────────────
  // SHARED_CTX is populated by renderer.js (e.g. SHARED_CTX.lastIntent,
  // SHARED_CTX.voiceState). When the palette opens, we generate suggestions
  // based on what the user just did.
  function buildPredictiveSuggestions() {
    const suggestions = [];
    const voiceState = SHARED_CTX.voiceState;
    if (voiceState === 'listening') {
      suggestions.push({
        id: 'pred:stop-voice',
        icon: '⏹',
        title: 'Stop voice listening',
        subtitle: 'Mic is currently active',
        run() { document.getElementById('voice-input')?.click(); },
      });
    }
    const lastIntent = SHARED_CTX.lastIntent;
    if (lastIntent === 'code') {
      suggestions.push({
        id: 'pred:open-repo',
        icon: '📂',
        title: 'Show repo browser',
        subtitle: 'You were working with code',
        run() { document.getElementById('input')?.focus(); },
      });
    }
    if (SHARED_CTX.sidecarStatus === 'error' || SHARED_CTX.sidecarStatus === 'disconnected') {
      suggestions.push({
        id: 'pred:fix-sidecar',
        icon: '🩹',
        title: 'Restart AI Runtime',
        subtitle: 'Sidecar appears disconnected',
        run() {
          try { window.jarvisIpc?.invoke?.('restart-sidecar'); } catch { /* ignored */ }
        },
      });
    }
    return suggestions;
  }

  // ─── Recent prompts ──────────────────────────────────────────────────────
  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_PROMPTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
    } catch { return []; }
  }
  function saveRecent(list) {
    try { localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); }
    catch { /* storage unavailable */ }
  }
  function pushRecent(text) {
    if (!text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const list = loadRecent().filter((entry) => entry !== trimmed);
    list.unshift(trimmed);
    saveRecent(list);
  }
  // Expose for renderer.js to call when a prompt is submitted.
  window.jarvisPaletteRecent = { push: pushRecent };

  // ─── Fuzzy match (simple subsequence match with score by gap penalty) ────
  function fuzzyMatch(query, text) {
    if (!query) return { score: 1, matched: true };
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0;
    let lastIdx = -1;
    let gapPenalty = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) {
        if (lastIdx !== -1) gapPenalty += (i - lastIdx - 1) * 0.05;
        lastIdx = i;
        qi += 1;
      }
    }
    if (qi !== q.length) return { score: 0, matched: false };
    const score = Math.max(0, 1 - gapPenalty - (t.length - q.length) * 0.005);
    return { score, matched: true };
  }

  // ─── Result aggregation ──────────────────────────────────────────────────
  function gatherResults(query) {
    const out = [];
    // Predictive first (context-aware)
    if (!query) {
      const preds = buildPredictiveSuggestions();
      if (preds.length) out.push({ section: 'Suggested', items: preds });
    }
    // Static commands
    const cmds = STATIC_COMMANDS
      .map((cmd) => ({ cmd, m: fuzzyMatch(query, `${cmd.title} ${cmd.subtitle || ''}`) }))
      .filter((entry) => entry.m.matched)
      .sort((a, b) => b.m.score - a.m.score)
      .map((entry) => entry.cmd);
    if (cmds.length) out.push({ section: 'Commands', items: cmds });
    // Recent prompts
    const recent = loadRecent();
    const matchedRecent = recent
      .map((text) => ({ text, m: fuzzyMatch(query, text) }))
      .filter((entry) => entry.m.matched)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 6)
      .map((entry, idx) => ({
        id: `recent:${idx}`,
        icon: '↺',
        title: entry.text.length > 90 ? entry.text.slice(0, 90) + '…' : entry.text,
        subtitle: 'Recent prompt — Enter to rerun',
        run() {
          const input = document.getElementById('input');
          if (input) {
            input.value = entry.text;
            input.focus();
          }
        },
      }));
    if (matchedRecent.length) out.push({ section: 'Recent', items: matchedRecent });
    return out;
  }

  // ─── UI rendering ────────────────────────────────────────────────────────
  let selectedIndex = 0;
  let flatItems = [];
  function render(query) {
    const resultsEl = document.getElementById('command-palette-results');
    if (!resultsEl) return;
    const sections = gatherResults(query);
    flatItems = [];
    resultsEl.innerHTML = '';
    if (sections.length === 0) {
      resultsEl.innerHTML = '<div class="cp-empty">No matches. Press Esc to close.</div>';
      return;
    }
    for (const section of sections) {
      const label = document.createElement('div');
      label.className = 'cp-section-label';
      label.textContent = section.section;
      resultsEl.appendChild(label);
      for (const cmd of section.items) {
        const item = document.createElement('div');
        item.className = 'cp-item';
        item.dataset.id = cmd.id;
        item.innerHTML = `
          <div class="cp-item-icon">${cmd.icon || '•'}</div>
          <div class="cp-item-main">
            <div class="cp-item-title"></div>
            ${cmd.subtitle ? '<div class="cp-item-sub"></div>' : ''}
          </div>
          ${cmd.kbd ? `<div class="cp-item-kbd">${cmd.kbd}</div>` : ''}
        `;
        item.querySelector('.cp-item-title').textContent = cmd.title;
        const subEl = item.querySelector('.cp-item-sub');
        if (subEl) subEl.textContent = cmd.subtitle;
        item.addEventListener('click', () => {
          execute(cmd);
        });
        item.addEventListener('mouseenter', () => {
          selectedIndex = flatItems.indexOf(cmd);
          updateSelection();
        });
        resultsEl.appendChild(item);
        flatItems.push(cmd);
      }
    }
    selectedIndex = 0;
    updateSelection();
  }
  function updateSelection() {
    const items = document.querySelectorAll('#command-palette-results .cp-item');
    items.forEach((el, idx) => el.classList.toggle('selected', idx === selectedIndex));
    const selected = items[selectedIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }
  function open() {
    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    if (!overlay || !input) return;
    overlay.classList.add('open');
    input.value = '';
    render('');
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    const overlay = document.getElementById('command-palette-overlay');
    if (overlay) overlay.classList.remove('open');
  }
  function isOpen() {
    const overlay = document.getElementById('command-palette-overlay');
    return overlay?.classList.contains('open');
  }
  function execute(cmd) {
    if (!cmd) return;
    close();
    try {
      if (typeof cmd.run === 'function') cmd.run();
    } catch (err) {
      console.error('[palette] command run failed:', err);
    }
  }

  // ─── Install once DOM is ready ───────────────────────────────────────────
  function install() {
    const input = document.getElementById('command-palette-input');
    const overlay = document.getElementById('command-palette-overlay');
    if (!input || !overlay) return;
    input.addEventListener('input', (e) => render(String(e.target.value || '')));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(flatItems.length - 1, selectedIndex + 1);
        updateSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        updateSelection();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        execute(flatItems[selectedIndex]);
      }
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    // Global hotkey — Ctrl+K / Cmd+K.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (isOpen()) close(); else open();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
