'use strict';

const { getTimePeriod } = require('./period');

function buildTemporalContext(options = {}) {
  const now = options.now instanceof Date ? new Date(options.now.getTime()) : new Date();
  const locale = options.locale || Intl.DateTimeFormat().resolvedOptions().locale;
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const hour = now.getHours();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  return {
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone,
    locale,
    localDate: now.toLocaleDateString(locale),
    localTime: now.toLocaleTimeString(locale),
    weekday,
    hour,
    period: getTimePeriod(hour),
  };
}

module.exports = {
  buildTemporalContext,
};

