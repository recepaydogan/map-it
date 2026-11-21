import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const research = (name) => JSON.parse(readFileSync(join(root, "data", "client-research", name), "utf8"));
const candidates = research("item-sparse-catalog.json");
const colors = research("item-quality-color-trace.json");
const icons = research("item-catalog-icon-extraction.json");
const sets = research("item-set-links.json");
const setRequirements = research("item-set-bonus-requirements.json");
const effects = research("item-effect-links.json");
const triggerSemantics = research("item-effect-trigger-semantics.json");
const sources = [candidates, colors, icons, sets, setRequirements, effects, triggerSemantics];
if (sources.some((source) => source.source.build !== 69977 || source.source.product !== "wow_classic_beta")) {
  throw new Error("Item research sources do not share the expected game build");
}
if (candidates.recordCount !== candidates.records.length || colors.tiers.length !== 7) {
  throw new Error("Item research counts are inconsistent");
}

const quality = new Map([...colors.tiers.map((tier) => [tier.code, tier.name]), [7, "Heirloom"]]);
const extractedIconIds = new Set(icons.icons.map(({ fileDataId }) => fileDataId));
const namedStatCodes = new Set([3, 4, 5, 6, 7, 12, 13, 14, 15, 31, 32,
  36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 54, 55, 56]);
const internalName = /\b(?:TEST|UNUSED|DEPRECATED|PLACEHOLDER|DEBUG|DND)\b|^\s*(?:\[PH\]|\[TMP\]|\(DNT\))/i;
const candidateIds = new Set(candidates.records.map((record) => record.itemId));
if (candidateIds.size !== candidates.records.length) throw new Error("Duplicate item ID in client catalog");
const requirementsBySet = new Map(setRequirements.records.map((set) => [set.itemSetId, set]));
const itemSets = new Map();
for (const set of sets.records) {
  const memberIds = [...new Set(set.memberItemIds.filter((id) => candidateIds.has(id)))];
  if (!memberIds.length) continue;
  const verifiedRequirements = requirementsBySet.get(set.itemSetId);
  if (verifiedRequirements && (verifiedRequirements.memberItemIds.length !== set.memberItemIds.length
    || verifiedRequirements.memberItemIds.some((id, index) => id !== set.memberItemIds[index]))) {
    throw new Error(`Item set ${set.itemSetId} changed after requirement verification`);
  }
  for (const id of memberIds) {
    const existing = itemSets.get(id) ?? [];
    existing.push({ id: String(set.itemSetId), name: set.name, memberItemIds: memberIds.map(String),
      ...(verifiedRequirements ? { bonuses: verifiedRequirements.bonuses.map((bonus) => ({
        id: String(bonus.bonusId), requiredPieces: bonus.requiredPieces,
        spellName: bonus.spellName,
      })).sort((left, right) => left.requiredPieces - right.requiredPieces) } : {}) });
    itemSets.set(id, existing);
  }
}
const spellLinks = new Map();
const triggerByCode = new Map(triggerSemantics.groups.map((group) => [group.code, group.semantic]));
for (const link of effects.records) {
  if (!candidateIds.has(link.itemId)) throw new Error(`Unknown effect item ${link.itemId}`);
  const trigger = triggerByCode.get(link.triggerCode);
  if (!trigger) throw new Error(`Unknown effect trigger ${link.triggerCode}`);
  const existing = spellLinks.get(link.itemId) ?? new Map();
  existing.set(link.spellId, { id: String(link.spellId), name: link.spellName, trigger });
  spellLinks.set(link.itemId, existing);
}

const items = candidates.records.map((record) => {
  const grade = quality.get(record.qualityCode);
  if (!grade) throw new Error(`Unknown quality ${record.qualityCode} on ${record.itemId}`);
  const icon = extractedIconIds.has(record.iconFileDataId)
    ? `data/items/icons/${record.iconFileDataId}.png` : undefined;
  if (icon && !existsSync(join(root, "public", icon))) throw new Error(`Missing item icon ${icon}`);
  const setsForItem = itemSets.get(record.itemId);
  const spellsForItem = spellLinks.get(record.itemId);
  const combatStats = [
    ...(record.combat.baseArmor ? [{ key: "base-armor", label: "database.clientItem.stat.armor",
      value: String(record.combat.baseArmor) }] : []),
    ...(record.combat.stats ?? []).filter(({ code }) => namedStatCodes.has(code))
      .map(({ code, value }) => ({ key: `stat-${code}`, label: `database.clientItem.stat.${code}`,
        value: value > 0 ? `+${value}` : String(value) })),
  ];
  return {
    id: String(record.itemId),
    name: record.name,
    ...(internalName.test(record.name) ? { hiddenFromList: true } : {}),
    category: record.className && record.subclassName
      ? `${record.className} · ${record.subclassName}` : "database.clientItem.unclassified",
    grade,
    ...(icon ? { icon } : {}),
    nameVerified: true,
    ...(record.requiredLevel > 0 ? { usageLevel: record.requiredLevel } : {}),
    itemLevel: record.itemLevel,
    ...(record.description ? { description: record.description } : {}),
    clientDetails: {
      ...(record.stackable > 1 ? { stackSize: record.stackable } : {}),
      ...(record.bonding >= 1 && record.bonding <= 4 ? { bonding: record.bonding } : {}),
      ...(record.sellPrice > 0 ? { sellPriceCopper: record.sellPrice } : {}),
      ...(record.buyPrice > 0 ? { buyPriceCopper: record.buyPrice } : {}),
      ...(record.itemDelay > 0 ? { itemDelayMs: record.itemDelay } : {}),
      ...(record.containerSlots > 0 ? { containerSlots: record.containerSlots } : {}),
      ...(record.inventoryType > 0 ? { inventoryType: record.inventoryType } : {}),
    },
    sections: combatStats.length ? [{ key: "base", stats: combatStats }] : [],
    enhancements: [],
    ...(setsForItem ? { itemSets: setsForItem } : {}),
    ...(spellsForItem ? { spellLinks: [...spellsForItem.values()] } : {}),
    hasReference: false,
    source: "ItemSparse + Item, wow_classic_beta build 69977",
  };
});
items.sort((a, b) => a.name.localeCompare(b.name) || Number(a.id) - Number(b.id));
writeFileSync(join(root, "public", "data", "items", "catalog.json"),
  `${JSON.stringify({ version: 2, items, recipes: [] }, null, 2)}\n`);
console.log(`Published ${items.length} items, ${itemSets.size} set members, ${spellLinks.size} items with spell links`);
