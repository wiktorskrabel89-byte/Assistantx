const { getTimePeriod } = require('../../jarvis/desktop/electron/temporal/period');

describe('temporal period mapping', () => {
  test('maps edge hours correctly', () => {
    expect(getTimePeriod(5)).toBe('morning');
    expect(getTimePeriod(11)).toBe('morning');
    expect(getTimePeriod(12)).toBe('afternoon');
    expect(getTimePeriod(17)).toBe('afternoon');
    expect(getTimePeriod(18)).toBe('evening');
    expect(getTimePeriod(21)).toBe('evening');
    expect(getTimePeriod(22)).toBe('night');
    expect(getTimePeriod(3)).toBe('night');
  });
});

