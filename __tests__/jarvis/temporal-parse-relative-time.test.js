const { parseRelativeTime } = require('../../jarvis/desktop/electron/temporal/parse-relative-time');

describe('parseRelativeTime EN+PL normalization', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('parses in 2 hours', () => {
    const parsed = parseRelativeTime('in 2 hours', { now, timezone: 'UTC' });
    expect(parsed?.triggerAt).toBeTruthy();
    expect(parsed?.confidence).toBeGreaterThan(0.9);
  });

  test('parses polish tomorrow morning phrase', () => {
    const parsed = parseRelativeTime('przypomnij mi jutro rano', { now, timezone: 'UTC' });
    expect(parsed?.triggerAt).toBeTruthy();
    expect(parsed?.confidence).toBeGreaterThan(0.8);
  });

  test('parses next friday', () => {
    const parsed = parseRelativeTime('next friday', { now, timezone: 'UTC' });
    expect(parsed?.triggerAt).toBeTruthy();
  });
});

