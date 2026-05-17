'use strict';

const { buildTemporalContext } = require('./context');

function formatReminderSpeech(reminder, options = {}) {
  const persona = String(options.persona || 'neutral').toLowerCase();
  const title = String(reminder?.label || reminder?.text || 'You have a reminder').trim();
  const when = reminder?.triggerAt ? new Date(reminder.triggerAt) : null;
  const now = options.now instanceof Date ? options.now : new Date();
  const diffMinutes = when ? Math.max(0, Math.round((when.getTime() - now.getTime()) / 60000)) : null;
  let lead = 'Reminder';
  if (persona === 'jarvis') lead = 'Sir';
  if (persona === 'minimal') lead = 'Reminder';
  if (persona === 'nova') lead = 'Heads up';
  if (diffMinutes !== null && diffMinutes > 0 && diffMinutes <= 180) {
    if (persona === 'jarvis') return `${lead}, ${title} starts in ${diffMinutes} minutes.`;
    return `${title} starts in ${diffMinutes} minutes.`;
  }
  if (persona === 'jarvis') return `${lead}, reminder: ${title}.`;
  return `Reminder: ${title}.`;
}

function enhanceSpeechText(input, options = {}) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (!options.temporalAwareness) return text;
  const context = buildTemporalContext({ now: options.now, locale: options.locale, timezone: options.timezone });
  if (/good (morning|afternoon|evening|night)|it('| i)s getting late|today is/i.test(text)) return text;
  if (context.period === 'night' && /meeting|coding|task|work/i.test(text)) {
    return `${text} It is getting late.`;
  }
  return text;
}

module.exports = {
  formatReminderSpeech,
  enhanceSpeechText,
};

