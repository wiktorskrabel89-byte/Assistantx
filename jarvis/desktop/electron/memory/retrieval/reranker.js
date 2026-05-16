'use strict';

function rerank(results = [], taskType = 'general') {
  return [...results]
    .map((item) => ({
      ...item,
      finalScore: Number(item.retrievalScore || 0)
        + (taskType === 'coding' && item.path ? 0.5 : 0)
        + (item.recencyScore ? Number(item.recencyScore || 0) * 0.2 : 0),
    }))
    .sort((a, b) => b.finalScore - a.finalScore);
}

module.exports = { rerank };
