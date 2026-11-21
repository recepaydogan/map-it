/** Exact identity joins shared by the search exporter and its regression tests. */
export const sectionLinks = section => [...(section.links ?? []), ...(section.rows ?? []).flatMap(row => row.links ?? [])];

/** Placeholder and unpublished quests cannot establish an acquisition route. */
export const isSearchableRewardSource = entry => !entry.unnamed
  && Boolean(entry.name?.trim()) && !/^[?\s]+$/.test(entry.name)
  && (entry.category !== "quests" || entry.adventure?.listed !== false);

export const REWARD_KINDS = new Map([
  ...["possible-drops", "guaranteed-drops"].map(key => [`reference.labels.${key}`, "loot"]),
  ...["rewards", "choose-a-reward", "possible-rewards", "dungeon-rewards", "guaranteed-rewards", "first-clear-rewards", "repeat-rewards", "faction-rewards-light", "faction-rewards-dark"].map(key => [`reference.labels.${key}`, "reward"]),
  ["reference.adventure.gatheringResults", "gather"],
]);

export const acquisitionKind = kind => ({
  "boss-drop": "loot", "enemy-drop": "loot", merchant: "purchase", "random-shop": "purchase", "cash-shop": "purchase",
  "coin-shop": "purchase", gather: "gather", "craft-station": "craft", pickup: "pickup",
})[kind];

export function resolveAcquisitionTargets(source, byMarker, byEntity) {
  if (source.markerId && source.mapId) {
    const target = byMarker.get(`${source.mapId}:${source.markerId}`);
    if (target !== undefined) return [target];
  }
  const table = source.kind === "gather" || source.kind === "pickup" ? "EnvObjData" : "NpcData";
  return [...new Set([source.entityId, ...(source.entityIds ?? [])].filter(Boolean)
    .flatMap(id => byEntity.get(`${table}:${id}`) ?? [])
    .filter(target => !source.mapId || target.mapId === source.mapId).map(target => target.index))];
}

/** Keep provenance in the key; a box reward must never become a direct drop. */
export const sourceKey = source => JSON.stringify([source.location, source.kind, source.via?.map(entry => entry.id) ?? []]);

export function createSourceCollector() {
  const sources = new Map();
  return {
    sources,
    add(itemId, source) {
      const rows = sources.get(itemId) ?? new Map();
      sources.set(itemId, rows);
      const key = sourceKey(source);
      const previous = rows.get(key);
      rows.set(key, { ...previous, ...source, rates: source.rates?.length ? source.rates : previous?.rates });
    },
  };
}

/** Follow physical container contents by item ID, guarding nested-box cycles. */
export function expandContainerSources(collector, contents, items) {
  const direct = [...collector.sources].map(([id, sources]) => [id, [...sources.values()]]);
  for (const [rootId, sources] of direct) {
    const visit = (id, path, visited) => {
      for (const childId of contents.get(id) ?? []) {
        if (visited.has(childId)) continue;
        for (const source of sources) collector.add(childId, {
          location: source.location, kind: "container", originKind: source.kind,
          via: [...(source.via ?? []), ...path.map(itemId => ({ id: itemId, name: items.get(itemId)?.name ?? itemId, category: "items" }))],
        });
        visit(childId, [...path, childId], new Set([...visited, childId]));
      }
    };
    visit(rootId, [rootId], new Set([rootId]));
  }
}
