const PROTECTED_APP_KEYS = new Set([
  'cmd',
  'powershell',
  'terminal',
  'regedit',
  'taskkill',
  'services msc',
  'gpedit',
  'diskpart',
  'bcdedit',
  'shutdown',
]);

const SCRIPT_EXTENSIONS = new Set(['.ps1', '.bat', '.cmd', '.vbs', '.js', '.wsf', '.hta', '.py']);
const CONFIRMATION_TRIGGERS = new Set(['voice', 'remote', 'workflow', 'ai']);

function normalizeTrigger(trigger) {
  const value = String(trigger || '').trim().toLowerCase();
  if (!value) return 'manual';
  if (value === 'mobile') return 'remote';
  if (value === 'sidecar' || value === 'speech' || value === 'browser-voice') return 'voice';
  return value;
}

module.exports = {
  CONFIRMATION_TRIGGERS,
  PROTECTED_APP_KEYS,
  SCRIPT_EXTENSIONS,
  normalizeTrigger,
};
