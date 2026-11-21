import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readVerifiedEquipmentCatalog } from "./native-equipment.mjs";

export const readVerifiedEquipmentItemCatalog = (filename, projectRoot) => {
  const catalog = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!catalog.hashes || !Object.keys(catalog.hashes).length || !catalog.references) throw new Error("Equipment identities lack source hashes");
  for (const [file, expected] of Object.entries(catalog.hashes)) {
    const actual = createHash("sha256").update(fs.readFileSync(path.resolve(projectRoot, file))).digest("hex");
    if (actual !== expected) throw new Error(`Stale equipment identity source: ${file}`);
  }
  const native = readVerifiedEquipmentCatalog(path.resolve(projectRoot, catalog.inputs.equipmentCatalog), projectRoot);
  if (!isDeepStrictEqual(native.definitions, catalog.definitions)) throw new Error("Equipment identity definitions differ from native source");
  const database = JSON.parse(fs.readFileSync(path.resolve(projectRoot, catalog.inputs.itemDatabase), "utf8"));
  if (database.sourceBuild !== catalog.sourceBuild) throw new Error("Equipment item/source builds differ");
  return { catalog, items: database.items };
};

export const createEquipmentLootProfiler = ({ catalog, items }) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (entity, native) => {
    const selected = native.fields.Equipment;
    if (!selected || selected.conflict || !selected.value) return null;
    const definition = catalog.definitions[selected.value];
    const laterScene = Boolean(entity.storyDestination) || entity.id !== native.characterId;
    const lootable = native.fields.IsLootable?.value, equipmentLootable = native.fields.IsEquipmentLootable?.value;
    const profile = { characterContentId: native.characterId, definitionId: selected.value, fields: native.fields, inventoryReferences: native.inventoryReferences,
      scene: laterScene ? "requires-scene-review" : "authored-placement", groups: [] };
    if (!definition) return { profile: { ...profile, reviewReason: "equipment-definition-not-found" }, drops: [] };
    const inventory = [...(entity.deathLoot?.guaranteedDrops ?? []), ...(entity.deathLoot?.randomLootPools ?? []).flatMap((pool) => pool.possibleLoot ?? [])];
    const drops = new Map();
    profile.groups = definition.groups.map((group, groupIndex) => ({ sourcePath: definition.sourcePath, sourceLine: group.sourceLine,
      entries: group.entries.map((entry) => {
        const reference = catalog.references[entry.statsId];
        if (!reference) throw new Error(`Equipment identity reference missing: ${entry.statsId}`);
        const item = reference.status === "resolved" && reference.itemIds.length === 1 ? byId.get(reference.itemIds[0]) : undefined;
        if (reference.status === "resolved" && (!item || item.statsId !== entry.statsId || !item.templateIds.includes(reference.rootTemplateId))) {
          throw new Error(`Equipment identity does not match its generating item: ${entry.statsId}`);
        }
        const overlap = item && (inventory.some((existing) => existing.statsId === entry.statsId || existing.templateId === reference.rootTemplateId)
          || native.inventoryReferences.some((existing) => existing.itemName === entry.statsId || existing.templateId === reference.rootTemplateId));
        const reviewReason = laterScene ? "requires-scene-review"
          : lootable === false || equipmentLootable === false ? "not-lootable"
            : lootable !== true || equipmentLootable !== true ? "lootability-unresolved"
              : !item ? "item-identity-unresolved"
                : group.entries.length !== 1 ? "equipment-group-alternatives"
                  : overlap ? "inventory-overlap" : undefined;
        const resolved = { statsId: entry.statsId, sourceLine: entry.sourceLine,
          ...(item ? { itemId: item.id, rootTemplateId: reference.rootTemplateId } : { candidateItemIds: reference.candidateItemIds }),
          status: reviewReason ?? "authored-death-loot" };
        if (!reviewReason) {
          const current = drops.get(item.id);
          const sourceGroup = { groupIndex, sourceLine: entry.sourceLine };
          if (current) { current.amount++; current.equipmentSource.groups.push(sourceGroup); }
          else drops.set(item.id, { itemName: entry.statsId, title: item.name, statsId: entry.statsId,
            templateId: reference.rootTemplateId, amount: 1, canBePickpocketed: false, guaranteedOnDeath: true,
            rarity: item.rarity, slot: item.gameplay?.slot, unique: item.unique,
            equipmentSource: { definitionId: definition.id, itemId: item.id, sourcePath: definition.sourcePath, groups: [sourceGroup] } });
        }
        return resolved;
      }) }));
    return { profile, drops: [...drops.values()] };
  };
};

export const applyEquipmentLootProfile = (entity, resolved) => {
  if (!resolved) return entity;
  if (entity.authoredEquipment) throw new Error(`Equipment profile already applied: ${entity.id}`);
  return { ...entity, authoredEquipment: resolved.profile,
    ...(resolved.drops.length ? { deathLoot: { ...entity.deathLoot,
      guaranteedDrops: [...(entity.deathLoot?.guaranteedDrops ?? []), ...resolved.drops],
      treasureTables: entity.deathLoot?.treasureTables ?? [], randomLootPools: entity.deathLoot?.randomLootPools ?? [] } } : {}) };
};
