'use strict';

function createGoogleCalendar({ auth }) {
  async function api(path, query = {}) {
    const token = await auth.getAccessToken();
    const url = new URL(`https://www.googleapis.com/calendar/v3${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `google-calendar-http-${response.status}`);
    return data;
  }

  function dayUtcRange() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }

  async function getEvents({ timeMin, timeMax, maxResults = 20 } = {}) {
    const payload = await api('/calendars/primary/events', {
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults,
    });
    return payload?.items || [];
  }

  async function getTodaySchedule() {
    const { timeMin, timeMax } = dayUtcRange();
    return getEvents({ timeMin, timeMax });
  }

  return {
    getEvents,
    getTodaySchedule,
  };
}

module.exports = {
  createGoogleCalendar,
};
