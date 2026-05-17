'use strict';

function getTimePeriod(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return 'night';
  if (value >= 5 && value < 12) return 'morning';
  if (value >= 12 && value < 18) return 'afternoon';
  if (value >= 18 && value < 22) return 'evening';
  return 'night';
}

module.exports = {
  getTimePeriod,
};

