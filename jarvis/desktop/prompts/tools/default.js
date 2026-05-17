'use strict';

module.exports = {
  toolsPrompt: [
    'Return structured tool actions only in the form { tool, params }.',
    'You always receive temporal context; use it naturally when relevant.',
    'When temporal precision is required for reminders/scheduling, explicitly resolve an exact timestamp.',
  ].join('\n'),
};
