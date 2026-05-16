'use strict';

const { hybridSearch } = require('./hybrid-search');
const { expandRepoRelationships } = require('./repo-aware');
const { rerank } = require('./reranker');

async function semanticRecall({ query, sources = [], taskType = 'general', limit = 10 }) {
  const hybrid = hybridSearch({ query, sources });
  const repoAware = expandRepoRelationships(hybrid, sources);
  const ranked = rerank(repoAware, taskType);

  const deduped = [];
  const seen = new Set();
  for (const item of ranked) {
    const key = `${item.path || ''}:${item.text || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= Number(limit || 10)) break;
  }

  return deduped;
}

module.exports = { semanticRecall };
