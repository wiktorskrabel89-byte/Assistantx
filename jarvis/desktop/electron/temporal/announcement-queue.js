'use strict';

function createAnnouncementQueue({ canSpeak = () => true, onSpeak = async () => {} } = {}) {
  const queue = [];
  let running = false;

  async function processNext() {
    if (running) return;
    running = true;
    while (queue.length > 0) {
      let processedInPass = false;
      const passCount = queue.length;
      for (let i = 0; i < passCount; i += 1) {
      const item = queue.shift();
      const allowed = canSpeak(item);
      if (!allowed) {
        if (item.priority === 'CRITICAL') {
          await onSpeak(item);
          processedInPass = true;
          continue;
        }
        if (item.deferCount >= 10) continue;
        queue.push({ ...item, deferCount: (item.deferCount || 0) + 1 });
        continue;
      }
      await onSpeak(item);
      processedInPass = true;
      }
      if (!processedInPass) break;
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
