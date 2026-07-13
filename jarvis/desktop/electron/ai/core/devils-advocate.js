'use strict';

/**
 * Devil's Advocate System — Jarvis Core system #14. Scans a model's
 * response text for destructive/high-stakes patterns before it's surfaced
 * to the user, so risky actions are flagged instead of silently passed
 * through. Basic scope: warns, never blocks (full Universal Approval Flow
 * gating is later-phase work per the Phase 1 LOCK LIST).
 */

const RISK_PATTERNS = [
  { id: 'rm-rf', re: /\brm\s+-rf\b/i, label: 'usuwanie rekurencyjne (rm -rf)' },
  { id: 'force-push', re: /\b(git\s+push\s+.*--force|force[\s-]?push)\b/i, label: 'force push' },
  { id: 'reset-hard', re: /\bgit\s+reset\s+--hard\b/i, label: 'git reset --hard' },
  { id: 'drop-table', re: /\bdrop\s+table\b/i, label: 'DROP TABLE' },
  { id: 'delete-all', re: /\bdelete\s+(all|everything)\b/i, label: 'usunięcie wszystkiego' },
  { id: 'no-verify', re: /--no-verify\b/i, label: 'pominięcie hooków (--no-verify)' },
  { id: 'truncate', re: /\btruncate\s+table\b/i, label: 'TRUNCATE TABLE' },
  { id: 'disable-auth', re: /\b(disable|wyłącz)\s+(authentication|auth|2fa|mfa)\b/i, label: 'wyłączenie autoryzacji' },
];

function scanForRisk(text) {
  const content = String(text || '');
  const flags = RISK_PATTERNS.filter((p) => p.re.test(content)).map((p) => ({ id: p.id, label: p.label }));
  return { risky: flags.length > 0, flags };
}

function annotateResponse(text, flags) {
  if (!flags.length) return text;
  const labels = flags.map((f) => f.label).join(', ');
  return `⚠️ Devil's Advocate: wykryto potencjalnie ryzykowne działania (${labels}). Sprawdź dokładnie przed wykonaniem.\n\n${text}`;
}

module.exports = { scanForRisk, annotateResponse, RISK_PATTERNS };
