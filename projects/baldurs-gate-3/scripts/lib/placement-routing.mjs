import { isDeepStrictEqual } from "node:util";

const indexUnique = (entries, key, label) => {
  const result = new Map();
  for (const entry of entries) {
    const id = entry[key];
    if (!id || result.has(id)) throw new Error(`Missing/duplicate ${label}: ${id}`);
    result.set(id, entry);
  }
  return result;
};

/** Route isolated documents without filesystem writes or source deletion. */
export const finalizePlacementRouting = (maps, documents) => {
  const definitions = indexUnique(maps, "id", "map definition");
  const descendants = new Map(), visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`Cyclic superseding-map configuration: ${id}`);
    if (descendants.has(id)) return descendants.get(id);
    const map = definitions.get(id);
    if (!map || !documents.has(id)) throw new Error(`Missing configured map: ${id}`);
    visiting.add(id);
    const children = new Set();
    for (const child of map.supersededBy ?? []) {
      children.add(child);
      for (const nested of visit(child)) children.add(nested);
    }
    visiting.delete(id);
    descendants.set(id, children);
    return children;
  };
  for (const { id } of maps) visit(id);
  if (documents.size !== maps.length) throw new Error("Routing requires exactly the configured map set");

  const original = new Map();
  for (const [mapId, { content, locations, placement }] of documents) {
    const entities = indexUnique(content.entities, "id", `${mapId} content identity`);
    indexUnique(locations.locations, "id", `${mapId} location identity`);
    indexUnique(placement.candidates, "id", `${mapId} candidate identity`);
    for (const location of locations.locations) {
      if (!entities.has(location.contentId)) throw new Error(`Location without content: ${mapId}/${location.id}`);
    }
    original.set(mapId, entities);
  }

  // Decide from the same unmodified snapshot, so configuration order cannot
  // retain an ancestor copy after a child was already routed to its own child.
  const removals = new Map();
  for (const { id: mapId } of maps) {
    const removed = new Set();
    for (const [id, entity] of original.get(mapId)) {
      for (const child of descendants.get(mapId)) {
        const duplicate = original.get(child).get(id);
        if (!duplicate) continue;
        if (!isDeepStrictEqual(entity.worldPosition, duplicate.worldPosition)
          || entity.templateId !== duplicate.templateId || entity.statsId !== duplicate.statsId) {
          throw new Error(`Superseding identity has a different native placement/item: ${mapId}/${child}/${id}`);
        }
        removed.add(id);
      }
    }
    removals.set(mapId, removed);
  }
  const beforeIds = new Set([...original.values()].flatMap((entries) => [...entries.keys()]));
  const available = new Set(maps.flatMap(({ id: mapId }) => [...original.get(mapId).keys()].filter((id) => !removals.get(mapId).has(id))));
  for (const id of beforeIds) if (!available.has(id)) throw new Error(`Routing would lose content identity: ${id}`);
  const removedAppearances = [], removedLinks = [];
  for (const [mapId, { content, locations, placement }] of documents) {
    const removed = removals.get(mapId);
    for (const id of removed) {
      const retainedOnMaps = [...descendants.get(mapId)].filter((child) => original.get(child).has(id) && !removals.get(child).has(id));
      if (!retainedOnMaps.length) throw new Error(`No retained descendant for ${mapId}/${id}`);
      removedAppearances.push({ mapId, id, retainedOnMaps, worldPosition: original.get(mapId).get(id).worldPosition });
    }
    content.entities = content.entities.filter(({ id }) => !removed.has(id));
    locations.locations = locations.locations.filter(({ contentId }) => !removed.has(contentId));
    placement.candidates = placement.candidates.filter(({ id }) => !removed.has(id));
    placement.stats.candidates = placement.candidates.length;
    for (const entity of content.entities) for (const field of ["access", "puzzleCombinations", "mechanism"]) {
      if (!entity[field]?.related) continue;
      entity[field].related = entity[field].related.filter((link) => {
        if (available.has(link.contentId)) return true;
        removedLinks.push({ mapId, id: entity.id, field: `${field}.related`, reason: "unavailable-target", link });
        return false;
      });
    }
    if (content.relationships) content.relationships = content.relationships.filter((link) => {
      const reason = removed.has(link.fromId) ? "superseded-source"
        : !available.has(link.fromId) || !available.has(link.toId) ? "unavailable-endpoint" : null;
      if (!reason) return true;
      removedLinks.push({ mapId, field: "relationships", reason, link });
      return false;
    });
  }
  return { removedAppearances, removedLinks, stats: { maps: maps.length,
    originalAppearances: [...original.values()].reduce((count, entries) => count + entries.size, 0),
    retainedAppearances: [...documents.values()].reduce((count, { content }) => count + content.entities.length, 0),
    originalIdentities: beforeIds.size, retainedIdentities: available.size,
    removedDuplicateAppearances: removedAppearances.length, removedLinks: removedLinks.length } };
};
