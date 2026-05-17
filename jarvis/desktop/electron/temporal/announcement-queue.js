'use strict';

function createAnnouncementQueue({ canSpeak = () => true, onSpeak = async () => {} } = {}) {
  const queue = [];
  let running = false;

  async function processNext() {
    if (running) return;
    running = true;
    while (queue.length > 0) {
      const item = queue.shift();
      const allowed = canSpeak(item);
      if (!allowed) {
        if (item.priority === 'CRITICAL') {
          await onSpeak(item);
          continue;
        }
        if (item.deferCount >= 10) continue;
        queue.push({ ...item, deferCount: (item.deferCount || 0) + 1 });
        break;
      }
      await onSpeak(item);
    }
    running = false;
  }

  return {
    enqueue(entry) {
      queue.push({ ...entry, deferCount: entry.deferCount || 0 });
      void processNext();
    },
    processNext,
    getSnapshot() {
      return queue.slice();
    },
  };
}

module.exports = {
  createAnnouncementQueue,
};

