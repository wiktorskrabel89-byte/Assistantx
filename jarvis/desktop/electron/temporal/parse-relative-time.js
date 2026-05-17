'use strict';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_PL = {
  niedziela: 'sunday',
  niedziele: 'sunday',
  poniedzialek: 'monday',
  poniedziałek: 'monday',
  wtorek: 'tuesday',
  sroda: 'wednesday',
  środa: 'wednesday',
  czwartek: 'thursday',
  piatek: 'friday',
  piątek: 'friday',
  sobota: 'saturday',
};

const NORMALIZATION = [
  [/\bjutro\b/gi, 'tomorrow'],
  [/\bdzisiaj\b/gi, 'today'],
  [/\bdziś\b/gi, 'today'],
  [/\bwieczorem\b/gi, 'evening'],
  [/\brano\b/gi, 'morning'],
  [/\bw\s*(\d+)\s*godzin(?:y|ę|a)?\b/gi, 'in $1 hours'],
  [/\bza\s*(\d+)\s*godzin(?:y|ę|a)?\b/gi, 'in $1 hours'],
  [/\bza\s*(\d+)\s*minut(?:y|ę)?\b/gi, 'in $1 minutes'],
  [/\bw\s*weekend\b/gi, 'this weekend'],
  [/\bnast[eę]pny\s+pi[aą]tek\b/gi, 'next friday'],
  [/\bnast[eę]pny\s+poniedzia[łl]ek\b/gi, 'next monday'],
];

function normalizeTemporalText(input) {
  let normalized = String(input || '').trim();
  for (const [pattern, replacement] of NORMALIZATION) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function parseClock(text) {
  const match = String(text || '').match(/\b(?:at|o)?\s*(\d{1,2})(?::(\d{2}))?\b/i);
  if (!match) return null;
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2] || 0)));
  return { hour, minute };
}

function applyTime(date, time, fallback) {
  const base = new Date(date.getTime());
  if (time) base.setHours(time.hour, time.minute, 0, 0);
  else base.setHours(fallback.hour, fallback.minute, 0, 0);
  return base;
}

function nextWeekdayDate(fromDate, targetWeekday) {
  const base = new Date(fromDate.getTime());
  const day = base.getDay();
  let delta = (targetWeekday - day + 7) % 7;
  if (delta === 0) delta = 7;
  base.setDate(base.getDate() + delta);
  return base;
}

function resolveWeekend(fromDate) {
  const day = fromDate.getDay();
  const saturday = new Date(fromDate.getTime());
  saturday.setHours(9, 0, 0, 0);
  let delta = (6 - day + 7) % 7;
  if (delta === 0 && fromDate.getHours() > 18) delta = 7;
  saturday.setDate(saturday.getDate() + delta);
  return saturday;
}

function parseRelativeTime(input, options = {}) {
  const originalText = String(input || '').trim();
  if (!originalText) return null;

  const normalized = normalizeTemporalText(originalText.toLowerCase());
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parsedClock = parseClock(normalized);
  const result = {
    originalText,
    normalizedText: normalized,
    timezone,
    confidence: 0,
    triggerAt: null,
  };

  const inHours = normalized.match(/\bin\s+(\d+)\s+hours?\b/i);
  if (inHours) {
    const target = new Date(now.getTime() + Number(inHours[1]) * 60 * 60 * 1000);
    result.triggerAt = target.toISOString();
    result.confidence = 0.95;
    return result;
  }

  const inMinutes = normalized.match(/\bin\s+(\d+)\s+minutes?\b/i);
  if (inMinutes) {
    const target = new Date(now.getTime() + Number(inMinutes[1]) * 60 * 1000);
    result.triggerAt = target.toISOString();
    result.confidence = 0.95;
    return result;
  }

  if (/\btonight\b/.test(normalized) || /\bevening\b/.test(normalized)) {
    const target = applyTime(now, parsedClock, { hour: 20, minute: 0 });
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    result.triggerAt = target.toISOString();
    result.confidence = 0.9;
    return result;
  }

  if (/\btomorrow\b/.test(normalized)) {
    const target = new Date(now.getTime());
    target.setDate(target.getDate() + 1);
    if (/\bmorning\b/.test(normalized)) {
      target.setHours(8, 0, 0, 0);
    } else {
      const withClock = applyTime(target, parsedClock, { hour: 9, minute: 0 });
      target.setTime(withClock.getTime());
    }
    result.triggerAt = target.toISOString();
    result.confidence = 0.92;
    return result;
  }

  if (/\bthis weekend\b/.test(normalized)) {
    result.triggerAt = resolveWeekend(now).toISOString();
    result.confidence = 0.88;
    return result;
  }

  const weekdayMatch = normalized.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const weekday = weekdayMatch[1];
    const target = nextWeekdayDate(now, WEEKDAYS.indexOf(weekday));
    const withClock = applyTime(target, parsedClock, { hour: 9, minute: 0 });
    result.triggerAt = withClock.toISOString();
    result.confidence = 0.9;
    return result;
  }

  for (const [pl, en] of Object.entries(WEEKDAYS_PL)) {
    if (!new RegExp(`\\b${pl}\\b`, 'i').test(normalized)) continue;
    const target = nextWeekdayDate(now, WEEKDAYS.indexOf(en));
    const withClock = applyTime(target, parsedClock, { hour: 9, minute: 0 });
    result.triggerAt = withClock.toISOString();
    result.confidence = 0.84;
    return result;
  }

  if (/\btoday\b/.test(normalized)) {
    const target = applyTime(now, parsedClock, { hour: now.getHours(), minute: now.getMinutes() + 5 });
    if (target.getTime() <= now.getTime()) target.setMinutes(target.getMinutes() + 30);
    result.triggerAt = target.toISOString();
    result.confidence = 0.7;
    return result;
  }

  return null;
}

module.exports = {
  normalizeTemporalText,
  parseRelativeTime,
};

