'use strict';

function buildDailySummary({ reminders = [], tasks = [], schedules = [] } = {}) {
  const pendingTasks = tasks.filter((task) => !task.completed).length;
  const pendingReminders = reminders.filter((item) => !item.completed);
  const upcomingSchedules = schedules.filter((item) => item.enabled !== false).length;
  return [
    'Good morning.',
    `You have ${pendingReminders.length} reminder${pendingReminders.length === 1 ? '' : 's'}.`,
    `${pendingTasks} pending task${pendingTasks === 1 ? '' : 's'}.`,
    `${upcomingSchedules} active schedule${upcomingSchedules === 1 ? '' : 's'}.`,
  ].join('\n');
}

module.exports = {
  buildDailySummary,
};

