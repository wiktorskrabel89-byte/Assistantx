'use strict';

const fs = require('fs');
const path = require('path');

function normalizeState(input) {
  const state = input && typeof input === 'object' ? input : {};
  return {
    entities: Array.isArray(state.entities) ? state.entities : [],
    relations: Array.isArray(state.relations) ? state.relations : [],
  };
}

function createMemoryTools({ app }) {
  if (!app || typeof app.getPath !== 'function') throw new Error('electron-app-required');
  const memoryPath = path.join(app.getPath('userData'), 'jarvis-memory.json');

  async function readState() {
    try {
      const raw = await fs.promises.readFile(memoryPath, 'utf8');
      return normalizeState(JSON.parse(raw));
    } catch {
      return normalizeState(null);
    }
  }

  async function writeState(state) {
    await fs.promises.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.promises.writeFile(memoryPath, JSON.stringify(normalizeState(state), null, 2), 'utf8');
  }

  function toEntityMap(state) {
    const map = new Map();
    for (const item of state.entities) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      map.set(name.toLowerCase(), {
        name,
        entityType: String(item?.entityType || 'entity'),
        observations: Array.isArray(item?.observations) ? item.observations.map((obs) => String(obs || '').trim()).filter(Boolean) : [],
      });
    }
    return map;
  }

  async function create_entities(params = {}) {
    const state = await readState();
    const entities = Array.isArray(params.entities) ? params.entities : [];
    const map = toEntityMap(state);
    for (const input of entities) {
      const name = String(input?.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key);
      const observations = Array.isArray(input?.observations)
        ? input.observations.map((obs) => String(obs || '').trim()).filter(Boolean)
        : [];
      if (!existing) {
        map.set(key, {
          name,
          entityType: String(input?.entityType || 'entity'),
          observations,
        });
      } else {
        existing.entityType = String(input?.entityType || existing.entityType || 'entity');
        existing.observations = [...new Set([...existing.observations, ...observations])];
      }
    }
    state.entities = [...map.values()];
    await writeState(state);
    return { entities: state.entities };
  }

  async function create_relations(params = {}) {
    const state = await readState();
    const relations = Array.isArray(params.relations) ? params.relations : [];
    const dedupe = new Set(state.relations.map((item) => `${item.from}|${item.to}|${item.relationType}`));
    for (const input of relations) {
      const from = String(input?.from || '').trim();
      const to = String(input?.to || '').trim();
      const relationType = String(input?.relationType || '').trim();
      if (!from || !to || !relationType) continue;
      const key = `${from}|${to}|${relationType}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      state.relations.push({ from, to, relationType });
    }
    await writeState(state);
    return { relations: state.relations };
  }

  async function add_observations(params = {}) {
    const state = await readState();
    const updates = Array.isArray(params.observations) ? params.observations : [];
    const map = toEntityMap(state);
    for (const item of updates) {
      const entityName = String(item?.entityName || '').trim();
      if (!entityName) continue;
      const key = entityName.toLowerCase();
      const entity = map.get(key) || { name: entityName, entityType: 'entity', observations: [] };
      const additions = Array.isArray(item?.contents)
        ? item.contents.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
      entity.observations = [...new Set([...entity.observations, ...additions])];
      map.set(key, entity);
    }
    state.entities = [...map.values()];
    await writeState(state);
    return { entities: state.entities };
  }

  async function delete_entities(params = {}) {
    const targets = new Set((Array.isArray(params.entityNames) ? params.entityNames : []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
    const state = await readState();
    state.entities = state.entities.filter((entity) => !targets.has(String(entity?.name || '').trim().toLowerCase()));
    state.relations = state.relations.filter((relation) => {
      const from = String(relation?.from || '').trim().toLowerCase();
      const to = String(relation?.to || '').trim().toLowerCase();
      return !targets.has(from) && !targets.has(to);
    });
    await writeState(state);
    return { entities: state.entities, relations: state.relations };
  }

  async function delete_observations(params = {}) {
    const deletions = Array.isArray(params.deletions) ? params.deletions : [];
    const state = await readState();
    const map = toEntityMap(state);
    for (const item of deletions) {
      const entityName = String(item?.entityName || '').trim().toLowerCase();
      const values = new Set((Array.isArray(item?.observations) ? item.observations : []).map((entry) => String(entry || '').trim()).filter(Boolean));
      if (!entityName || values.size === 0) continue;
      const entity = map.get(entityName);
      if (!entity) continue;
      entity.observations = entity.observations.filter((obs) => !values.has(obs));
    }
    state.entities = [...map.values()];
    await writeState(state);
    return { entities: state.entities };
  }

  async function delete_relations(params = {}) {
    const removals = Array.isArray(params.relations) ? params.relations : [];
    const removeKeys = new Set(removals.map((item) => `${item?.from || ''}|${item?.to || ''}|${item?.relationType || ''}`));
    const state = await readState();
    state.relations = state.relations.filter((relation) => !removeKeys.has(`${relation.from}|${relation.to}|${relation.relationType}`));
    await writeState(state);
    return { relations: state.relations };
  }

  async function read_graph() {
    return readState();
  }

  async function search_nodes(params = {}) {
    const state = await readState();
    const query = String(params.query || '').trim().toLowerCase();
    if (!query) return { entities: state.entities, relations: state.relations };
    const entities = state.entities.filter((entity) => {
      const name = String(entity?.name || '').toLowerCase();
      const type = String(entity?.entityType || '').toLowerCase();
      const observations = Array.isArray(entity?.observations) ? entity.observations.join(' ').toLowerCase() : '';
      return name.includes(query) || type.includes(query) || observations.includes(query);
    });
    const names = new Set(entities.map((item) => String(item.name || '').toLowerCase()));
    const relations = state.relations.filter((relation) => names.has(String(relation?.from || '').toLowerCase()) || names.has(String(relation?.to || '').toLowerCase()));
    return { entities, relations };
  }

  async function open_nodes(params = {}) {
    const names = new Set((Array.isArray(params.names) ? params.names : []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
    const state = await readState();
    const entities = state.entities.filter((entity) => names.has(String(entity?.name || '').trim().toLowerCase()));
    const relations = state.relations.filter((relation) => names.has(String(relation?.from || '').trim().toLowerCase()) || names.has(String(relation?.to || '').trim().toLowerCase()));
    return { entities, relations };
  }

  return {
    create_entities,
    create_relations,
    add_observations,
    delete_entities,
    delete_observations,
    delete_relations,
    read_graph,
    search_nodes,
    open_nodes,
    getMemoryPath: () => memoryPath,
  };
}

module.exports = {
  createMemoryTools,
};
