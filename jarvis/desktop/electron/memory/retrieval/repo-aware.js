'use strict';

function expandRepoRelationships(results = [], sources = []) {
  const sourceByPath = new Map(sources.map((item) => [item.path, item]));
  const expanded = [...results];

  for (const result of results) {
    for (const relatedPath of result.relatedPaths || []) {
      const related = sourceByPath.get(relatedPath);
      if (!related) continue;
      expanded.push({
        ...related,
        relation: 'related-path',
        retrievalScore: Number(result.retrievalScore || 0) * 0.6,
      });
    }
  }

  return expanded;
}

module.exports = { expandRepoRelationships };
