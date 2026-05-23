'use strict';

const { getTimePeriod } = require('./period');

function buildTemporalContext(options = {}) {
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const locale = options.locale || Intl.DateTimeFormat().resolvedOptions().locale;
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const preferredLanguage = options.preferredLanguage || String(locale).split('-')[0]?.toLowerCase() || 'en';
  const hour = resolveHourInTimezone(now, timezone, locale);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: timezone }).format(now);
  const location = normalizeLocation(options.location);
  return {
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone,
    locale,
    preferredLanguage,
    localDate: now.toLocaleDateString(locale, { timeZone: timezone }),
    localTime: now.toLocaleTimeString(locale, { timeZone: timezone }),
    weekday,
    hour,
    period: getTimePeriod(hour),
    location,
  };
}

function resolveHourInTimezone(now, timezone, locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale || 'en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }).formatToParts(now);
    const hourValue = Number(parts.find((item) => item.type === 'hour')?.value);
    if (Number.isFinite(hourValue)) return hourValue;
  } catch {
    // fallback below
  }
  return now.getHours();
}

function normalizeLocation(input) {
  if (!input || typeof input !== 'object') return null;
  const city = String(input.city || '').trim();
  const region = String(input.region || '').trim();
  const country = String(input.country || '').trim();
  const countryCode = String(input.countryCode || '').trim().toUpperCase();
  const source = String(input.source || '').trim() || 'unknown';
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const hasText = city || region || country;
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!hasText && !hasCoords) return null;
  return {
    city: city || null,
    region: region || null,
    country: country || null,
    countryCode: countryCode || null,
    latitude: hasCoords ? latitude : null,
    longitude: hasCoords ? longitude : null,
    source,
  };
}

module.exports = {
  buildTemporalContext,
};
