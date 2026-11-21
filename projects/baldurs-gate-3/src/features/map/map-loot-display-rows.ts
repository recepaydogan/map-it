import {
  createItemDatabaseIndex,
  resolveItemDatabaseEntry,
} from "../items/item-database-match";
import type { ItemDatabaseEntry } from "../items/types";
import type { MapLootRow } from "./map-loot-utils";

export interface MapLootDisplayRow {
  id: string;
  item: ItemDatabaseEntry;
  amount: number;
  certainty: MapLootRow["certainty"];
  chance?: number;
}

const normalizeCategory = (value: string) => value.trim().toLocaleLowerCase("en-US");

/**
 * Turns engine-level loot categories into real catalog items. Category odds
 * are deliberately not copied to every candidate because the game can apply
 * level and runtime filters after choosing the category.
 */
export const createMapLootDisplayIndex = (items: ItemDatabaseEntry[]) => {
  const itemIndex = createItemDatabaseIndex(items);
  const itemsByObjectCategory = new Map<string, ItemDatabaseEntry[]>();

  for (const item of items) {
    // Random categories generate template items, not a named physical object.
    if (item.generation?.origin === "placed-identity") continue;
    for (const category of item.properties.ObjectCategory?.split(";") ?? []) {
      const key = normalizeCategory(category);
      if (!key) continue;
      const matches = itemsByObjectCategory.get(key) ?? [];
      matches.push(item);
      itemsByObjectCategory.set(key, matches);
    }
  }
  return { itemIndex, itemsByObjectCategory };
};

export const getMapLootDisplayRows = (
  rows: MapLootRow[],
  items: ItemDatabaseEntry[],
  index = createMapLootDisplayIndex(items),
): MapLootDisplayRow[] => {
  const { itemIndex, itemsByObjectCategory } = index;

  const displayRows = new Map<string, MapLootDisplayRow>();
  const inventoryAmounts = new Map<string, Map<string, { minimum: number; maximum: number }>>();
  const add = (row: MapLootRow, item: ItemDatabaseEntry, includeChance = true) => {
    if (row.certainty !== "possible") {
      const sources = inventoryAmounts.get(item.id) ?? new Map();
      const key = row.objectId ?? "generated-inventory";
      const previous = sources.get(key);
      sources.set(key, {
        minimum: Math.max(previous?.minimum ?? 0, row.certainty === "guaranteed" ? row.amount : 0),
        maximum: Math.max(previous?.maximum ?? 0, row.amount),
      });
      inventoryAmounts.set(item.id, sources);
    }
    const quantity = [...(inventoryAmounts.get(item.id)?.values() ?? [])].reduce((total, value) => ({
      minimum: total.minimum + value.minimum, maximum: total.maximum + value.maximum,
    }), { minimum: 0, maximum: 0 });
    const current = displayRows.get(item.id);
    const guaranteed = quantity.maximum > 0 && quantity.minimum === quantity.maximum;
    const conditional = quantity.maximum > quantity.minimum;
    const chance = guaranteed ? 100 : conditional ? undefined : current?.chance ?? (includeChance ? row.chance : undefined);
    displayRows.set(item.id, {
      id: item.id,
      item,
      // Different physical objects can still resolve to one generic item.
      // Preserve their combined stack count after retaining their UUIDs.
      amount: guaranteed || conditional ? quantity.maximum : 1,
      certainty: guaranteed ? "guaranteed" : conditional ? "conditional" : "possible",
      ...(chance !== undefined ? { chance } : {}),
    });
  };

  for (const row of rows) {
    if (row.kind === "category") {
      const categoryIds = [row.sourceId, row.sourceId.replace(/^T_/, "")];
      const candidates = categoryIds.flatMap((categoryId) => (
        itemsByObjectCategory.get(normalizeCategory(categoryId)) ?? []
      ));
      for (const item of new Map(candidates.map((candidate) => [candidate.id, candidate])).values()) {
        add(row, item, false);
      }
      continue;
    }

    const item = resolveItemDatabaseEntry(itemIndex, row);
    if (item) add(row, item);
  }

  const priority = { guaranteed: 0, conditional: 1, possible: 2 };
  return [...displayRows.values()].sort((left, right) => (
    priority[left.certainty] - priority[right.certainty]
    || (right.chance ?? -1) - (left.chance ?? -1)
    || left.item.name.localeCompare(right.item.name, "en")
  ));
};
