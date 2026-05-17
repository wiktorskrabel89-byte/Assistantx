const { createAnnouncementQueue } = require('../../jarvis/desktop/electron/temporal/announcement-queue');

describe('announcement queue interruption gating', () => {
  test('defers non-critical while busy and allows critical', async () => {
    let busy = true;
    const spoken = [];
    const queue = createAnnouncementQueue({
      canSpeak: (entry) => !busy || entry.priority === 'CRITICAL',
      onSpeak: async (entry) => { spoken.push(entry.id); },
    });

    queue.enqueue({ id: 'normal', priority: 'NORMAL' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spoken).toEqual([]);

    queue.enqueue({ id: 'critical', priority: 'CRITICAL' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spoken).toContain('critical');

    busy = false;
    await queue.processNext();
    expect(spoken).toContain('normal');
  });
});

