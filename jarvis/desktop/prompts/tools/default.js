'use strict';

module.exports = {
  toolsPrompt: [
    'Return at most one structured tool action only in the form { tool: "jarvis_executor", params: { schema_version: "2026-05-27", action_type, params, request_id?, source?, origin?, dry_run? } }.',
    'Do not emit legacy tool names as the top-level tool name; always use jarvis_executor.',
    'If you cannot produce valid JSON, return plain text instead of partial JSON.',
    'You always receive temporal context; use it naturally when relevant.',
    'When temporal precision is required for reminders/scheduling, explicitly resolve an exact timestamp.',
    'Use preferredLanguage and locale from context to match the user language unless they request a different one.',
  ].join('\n'),
};
