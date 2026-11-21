import type { MapContainerLootProfile, MapDeathLootProfile } from "./types";
import { getInventoryQuantity, type InventoryQuantityEntry } from "../../lib/inventory-quantity.mjs";

export interface MapLootRow {
  id: string;
  sourceId: string;
  kind: "item" | "category";
  title: string;
  amount: number;
  certainty: "guaranteed" | "conditional" | "possible";
  chance?: number;
  statsId?: string;
  templateId?: string;
  itemName?: string;
  objectId?: string;
}

const normalizeLootTitle = (title: string) => title.trim().toLocaleLowerCase("en-US");

export const getMapLootRows = (
  deathLoot?: MapDeathLootProfile,
  containerLoot?: MapContainerLootProfile,
): MapLootRow[] => {
  const rows = new Map<string, MapLootRow>();
  const inventoryGroups = new Map<string, Array<InventoryQuantityEntry & { conditional: boolean }>>();

  const addGuaranteedItem = ({
    id,
    title,
    amount = 1,
    statsId,
    templateId,
    itemName,
    objectId,
    inventoryCondition,
  }: Omit<MapLootRow, "certainty" | "chance" | "sourceId" | "kind"> & InventoryQuantityEntry, conditional = false) => {
    const key = [objectId ?? "", templateId ?? "", statsId ?? "", normalizeLootTitle(title)].join(":");
    const current = rows.get(key);
    const entries = inventoryGroups.get(key) ?? [];
    entries.push({ amount, inventoryCondition, conditional }); inventoryGroups.set(key, entries);
    const quantity = getInventoryQuantity(entries);
    const minimum = getInventoryQuantity(entries.filter((entry) => !entry.conditional)).minimum;
    const guaranteed = minimum === quantity.maximum;
    rows.set(key, {
      id: current?.id ?? id,
      sourceId: current?.sourceId ?? id,
      kind: "item",
      title: current?.title ?? title,
      amount: quantity.maximum,
      certainty: guaranteed ? "guaranteed" : "conditional",
      ...(guaranteed ? { chance: 100 } : {}),
      statsId: current?.statsId ?? statsId,
      templateId: current?.templateId ?? templateId,
      itemName: current?.itemName ?? itemName,
      ...(objectId ? { objectId } : {}),
    });
  };

  const addPossibleItem = ({
    id,
    title,
    chance,
    sourceId,
    kind,
    statsId,
    itemName,
  }: Omit<MapLootRow, "amount" | "certainty">, conditional = false) => {
    const key = ["", "", statsId ?? "", normalizeLootTitle(title)].join(":");
    const current = rows.get(key);
    if (current?.certainty === "guaranteed") return;
    const uncertainScene = conditional || current?.certainty === "conditional";
    const combinedChance = uncertainScene ? undefined : current?.chance !== undefined && chance !== undefined
      ? 100 * (1 - (1 - current.chance / 100) * (1 - chance / 100))
      : current ? undefined : chance;
    rows.set(key, {
      id: current?.id ?? id,
      sourceId: current?.sourceId ?? sourceId,
      kind: current?.kind ?? kind,
      title: current?.title ?? title,
      amount: current?.amount ?? 1,
      certainty: uncertainScene ? "conditional" : "possible",
      ...(combinedChance !== undefined ? { chance: Math.round(combinedChance * 100) / 100 } : {}),
      statsId: current?.statsId ?? statsId,
      itemName: current?.itemName ?? itemName,
    });
  };

  for (const drop of deathLoot?.guaranteedDrops ?? []) {
    // A container's death-loot metadata describes the same authored inventory,
    // not an additional copy. Its full inventory row already includes the item.
    const alreadyContained = containerLoot?.items.some((item) => item.itemName === drop.itemName
      && (item.objectId || "") === (drop.objectId || "")
      && (item.templateId || "") === (drop.templateId || "")
      && (item.statsId || "") === (drop.statsId || ""));
    if (alreadyContained) continue;
    addGuaranteedItem({
      id: drop.objectId || drop.statsId || drop.itemName,
      title: drop.title,
      amount: drop.amount,
      statsId: drop.statsId,
      templateId: drop.templateId,
      itemName: drop.itemName,
      objectId: drop.objectId,
      inventoryCondition: drop.inventoryCondition,
    }, Boolean(deathLoot?.availability));
  }

  for (const item of containerLoot?.items ?? []) {
    addGuaranteedItem({
      id: item.objectId || item.statsId || item.itemName,
      title: item.title,
      amount: item.amount,
      statsId: item.statsId,
      templateId: item.templateId,
      itemName: item.itemName,
      objectId: item.objectId,
      inventoryCondition: item.inventoryCondition,
    });
  }

  for (const { pool, conditional } of [
    ...(deathLoot?.randomLootPools ?? []).map((pool) => ({ pool, conditional: Boolean(deathLoot?.availability) })),
    ...(containerLoot?.randomLootPools ?? []).map((pool) => ({ pool, conditional: false })),
  ]) {
    if (pool.possibleLoot?.length) {
      for (const outcome of pool.possibleLoot) {
        addPossibleItem({
          id: `${pool.tableId}:${outcome.id}`,
          sourceId: outcome.id,
          kind: outcome.kind,
          title: outcome.title,
          chance: outcome.initialChance,
          statsId: outcome.statsId,
          ...(outcome.kind === "item" ? { itemName: outcome.id.replace(/^I_/, "") } : {}),
        }, conditional);
      }
      continue;
    }

    for (const title of new Set(pool.namedStock)) {
      addPossibleItem({
        id: `${pool.tableId}:${title}`,
        sourceId: title,
        kind: "item",
        title,
        itemName: title,
      }, conditional);
    }
    for (const title of new Set(pool.stockCategories)) {
      addPossibleItem({
        id: `${pool.tableId}:${title}`,
        sourceId: title,
        kind: "category",
        title,
      }, conditional);
    }
  }

  const priority = { guaranteed: 0, conditional: 1, possible: 2 };
  return [...rows.values()].sort((left, right) => (
    priority[left.certainty] - priority[right.certainty]
    || (right.chance ?? -1) - (left.chance ?? -1)
    || left.title.localeCompare(right.title, "en")
  ));
};
