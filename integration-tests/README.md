# Integration Tests (Runtime V2)

This directory tracks integration-level coverage for Jarvis Desktop runtime v2 behavior.

Current implemented integration tests live in:
- `__tests__/jarvis/integration/runtime-orchestration.test.js`
- `__tests__/jarvis/integration/streaming-lifecycle.test.js`
- `__tests__/jarvis/integration/cancellation-retry.test.js`
- `__tests__/jarvis/integration/tool-permission-safety.test.js`
- `__tests__/jarvis/integration/context-routing-prompt.test.js`

Planned additions:
- Full backend adapter + websocket workflow integration test matrix
- Voice interruption and wake suppression integration tests
- Automation persistence restart/rehydration integration tests
