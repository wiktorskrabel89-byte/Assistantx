const { createRuntimeV2 } = require('../../../jarvis/desktop/electron/runtime');
const { createTaskManager } = require('../../../jarvis/desktop/electron/runtime/task-manager');

describe('cancellation and retry integration', () => {
  test('propagates cancellation to child tasks and tracks retries', () => {
    const runtime = createRuntimeV2();
    const taskManager = createTaskManager({ bus: runtime.bus, cancellation: runtime.cancellation });

    const parent = taskManager.createTask({ id: 'parent', owner: 'test' });
    const child = taskManager.createTask({ id: 'child', owner: 'test', parentId: parent.id });

    taskManager.incrementRetry(parent.id, 'temporary-failure');
    expect(taskManager.getTask(parent.id).retryCount).toBe(1);

    const cancellation = runtime.cancellation.cancel(parent.id, 'user-interrupt');
    expect(cancellation.affected).toContain('parent');
    expect(cancellation.affected).toContain('child');
    expect(runtime.cancellation.isCancelled(child.id)).toBe(true);
  });
});
