import { createTreasureItemResolver } from "./treasure-item-identity.mjs";

const FIXED_MODES = new Set(["explicit-root", "matching-progression-root"]);
const ITEM_TYPES = new Set(["Weapon", "Armor", "Object"]);

// Equipment entries are literal Stats IDs, not I_-prefixed treasure-table
// references. Keep uncertain roots as review candidates, never as fixed gear.
export const resolveEquipmentItems = ({ definitions, stats, items, progression }) => {
  const byStatsId = new Map(), byTemplateId = new Map();
  for (const item of items) {
    if (item.generation?.origin === "placed-identity") continue;
    byStatsId.set(item.statsId, [...(byStatsId.get(item.statsId) ?? []), item]);
    for (const id of item.templateIds) {
      const key = id.toLowerCase();
      byTemplateId.set(key, [...(byTemplateId.get(key) ?? []), item]);
    }
  }
  const generated = createTreasureItemResolver({ stats, byStatsId, byTemplateId, progression });
  const references = {};
  for (const definition of Object.values(definitions)) for (const group of definition.groups) for (const { statsId } of group.entries) {
    if (Object.hasOwn(references, statsId)) continue;
    const candidates = generated.resolveStats(statsId), evidence = generated.records.get(statsId);
    const fixed = FIXED_MODES.has(evidence.mode);
    const resolved = fixed && candidates.length === 1 && ITEM_TYPES.has(stats.get(statsId)?.type);
    const { acceptedItemIds, ...generation } = evidence;
    references[statsId] = { ...generation, status: resolved ? "resolved" : "review",
      itemIds: resolved ? acceptedItemIds : [], candidateItemIds: resolved ? [] : acceptedItemIds,
      ...(fixed && !resolved ? { reviewReason: !ITEM_TYPES.has(stats.get(statsId)?.type)
        ? "not-an-item-stat" : "ambiguous-fixed-item" } : {}) };
  }
  return references;
};
