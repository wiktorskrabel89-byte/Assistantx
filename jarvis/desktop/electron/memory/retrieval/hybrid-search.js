'use strict';

function normalize(text) {
  return String(text || '').toLowerCase();
}

function keywordScore(query, text) {
  if (!query || !text) return 0;
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  let score = 0;
  const haystack = normalize(text);
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function embeddingScore(item) {
  return Number(item.embeddingScore || 0);
}

function pathScore(query, item) {
  const path = normalize(item.path || '');
  const q = normalize(query || '');
  if (!path || !q) return 0;
  return path.includes(q) ? 1 : 0;
}

// M7 — pull additional candidates out of the Memory + Knowledge stores
// and merge them with the caller's `sources` BEFORE scoring. Both stores
// are optional; when neither is provided this function reduces to the
// pre-M7 behaviour exactly.
function flattenMemorySources(memoryStore) {
  if (!memoryStore || typeof memoryStore.snapshot !== 'function') return [];
  let snap;
  try { snap = memoryStore.snapshot(); }
  catch { return []; }
  const items = [];
  for (const entry of snap.longTermMemory || []) {
    items.push({
      source: 'memory:longTerm',
      id: entry.id,
      text: entry.text,
      tags: entry.tags || [],
      timestamp: entry.timestamp,
      embeddingScore: 0,
    });
  }
  for (const entry of snap.conversationMemory || []) {
    items.push({
      source: 'memory:conversation',
      id: entry.id,
      text: entry.text,
      conversationId: entry.conversationId,
      timestamp: entry.timestamp,
      embeddingScore: 0,
    });
  }
  for (const [projectId, project] of Object.entries(snap.projectKnowledge || {})) {
    for (const note of project.notes || []) {
      items.push({ source: 'memory:project', projectId, text: String(note), embeddingScore: 0 });
    }
  }
  return items;
}

function flattenKnowledgeSources(knowledgeStore) {
  if (!knowledgeStore || typeof knowledgeStore.snapshot !== 'function') return [];
  let snap;
  try { snap = knowledgeStore.snapshot(); }
  catch { return []; }
  return (snap.entities || []).map((entity) => ({
    source: `knowledge:${entity.type}`,
    id: entity.id,
    text: [entity.label, entity.payload?.description, entity.payload?.summary]
      .filter(Boolean).join(' — '),
    entityType: entity.type,
    payload: entity.payload,
    embeddingScore: 0,
  }));
}

function hybridSearch({ query, sources = [], memoryStore = null, knowledgeStore = null }) {
  const merged = [
    ...sources,
    ...flattenMemorySources(memoryStore),
    ...flattenKnowledgeSources(knowledgeStore),
  ];
  return merged
    .map((item) => {
      const score = keywordScore(query, item.text || item.summary || '')
        + embeddingScore(item)
        + pathScore(query, item);
      return { ...item, retrievalScore: score };
    })
    .filter((item) => item.retrievalScore > 0)
    .sort((a, b) => b.retrievalScore - a.retrievalScore);
}

module.exports = { hybridSearch, flattenMemorySources, flattenKnowledgeSources };
