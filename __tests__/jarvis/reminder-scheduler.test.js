jest.mock('../../jarvis/desktop/local-state', () => ({
  getReminders: jest.fn(),
  markReminderCompleted: jest.fn(),
  markReminderFired: jest.fn(),
}));

const localState = require('../../jarvis/desktop/local-state');
const { startReminderScheduler, stopReminderScheduler } = require('../../jarvis/desktop/reminder-scheduler');

describe('reminder scheduler', () => {
  afterEach(() => {
    stopReminderScheduler();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('fires only unfired due reminders and marks fired', () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    localState.getReminders.mockReturnValue([
      { id: 'a', triggerAt: due, completed: false, firedAt: null },
      { id: 'b', triggerAt: due, completed: false, firedAt: 'already' },
    ]);
    const cb = jest.fn();
    jest.useFakeTimers();
    startReminderScheduler(cb);
    jest.advanceTimersByTime(30_000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(localState.markReminderFired).toHaveBeenCalledTimes(1);
    expect(localState.markReminderFired).toHaveBeenCalledWith('a', expect.any(String));
  });
});

