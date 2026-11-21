import raw from "./generated/er-items.json";

/**
 * Real Elden Ring item DB (base game, patch 1.10.0), built by
 * data/src/build-er-items.mjs from ERDB's bundled param + FMG data.
 * Implements item-material-detail-page-data-model.md.
 */
export interface ErItemMaterial {
  item_id: number;
  count: number;
  name?: string;
  /** Material identity, so the detail panel can drill into its codex page. */
  category?: string;
  icon_id?: number;
  item_key?: string;
}
/** A recipe a cookbook teaches — resolves to a real item (drillable via item_key). */
export interface ErItemUnlock {
  id: number;
  name: string;
  category: string;
  icon_id: number;
  item_key: string;
}
export interface ErItem {
  id: number;
  category: string;
  subtype?: string;
  name: string;
  description: string;
  goods_type?: number;
  icon_id: number;
  sell_value: number;
  weight?: number;
  stats: Record<string, unknown>;
  crafting?: { materials: ErItemMaterial[] };
  used_in_recipes?: number[];
  /** Cookbooks only: the recipes this book teaches (each links to its item codex). */
  unlocks?: ErItemUnlock[];
  obtainability?: {
    badges: string[];
    shop_stock?: number;
    /** Rune price when bought from a merchant (lowest across shops). */
    price?: number;
    /** Material the item is traded for — e.g. a Remembrance at Enia's duplication. */
    trade?: string;
  };
}

const data = raw as { patch: string; items: ErItem[] };

export const erPatch = data.patch;

/**
 * `erItems` / `erItemByKey` / `erItemById` are LIVE BINDINGS: the English data is
 * the frozen source of truth (ids, stats, crafting, icons). When the UI language
 * changes, `applyItemOverlay` reassigns them to localized COPIES — only `name`
 * and `description` swap, by itemKey. See data/localized-data.ts.
 */
const BASE_ITEMS = data.items;
const BASE_ITEM_BY_ENGLISH_NAME = new Map(BASE_ITEMS.map((item) => [item.name, item]));
export let erItems = BASE_ITEMS;

/**
 * Item ids COLLIDE across param tables (id 5030 = "Tibia's Summons" sorcery AND
 * "Taker's Cameo" talisman), so a bare-id Map silently resolves to the wrong item.
 * The unique identity is (param-group, id) — the same scheme the marker builder
 * uses. `erItemKey` mirrors build-er-markers.mjs `groupOf`; `erItemByKey` is the
 * authoritative lookup. Markers/drops carry `itemKey`; resolve via this, never the
 * bare id.
 */
const erGroup = (cat: string): string =>
  cat === "weapon" ? "weapon"
  : cat === "armor" ? "armor"
  : cat === "talisman" ? "accessory"
  : cat === "ash-of-war" ? "gem"
  : "goods";
const BASE_ITEM_BY_KEY = new Map(BASE_ITEMS.map((item) => [`${erGroup(item.category)}:${item.id}`, item]));
export const erItemKey = (it: ErItem): string => `${erGroup(it.category)}:${it.id}`;
export let erItemByKey = new Map(BASE_ITEMS.map((i) => [erItemKey(i), i]));

/** Bare-id Map kept only for crafting/recipe refs (goods-side ids); prefer erItemByKey. */
export let erItemById = new Map(BASE_ITEMS.map((i) => [i.id, i]));

/** Resolve an English source-data name to the currently localized item. */
export const erItemByEnglishName = (name: string): ErItem | undefined => {
  const baseItem = BASE_ITEM_BY_ENGLISH_NAME.get(name);
  return baseItem ? erItemByKey.get(erItemKey(baseItem)) : undefined;
};

/** Stable English text used only for matching generated acquisition relationships. */
export const erItemEnglishText = (name: string): Pick<ErItem, "name" | "description"> | undefined => {
  const item = BASE_ITEM_BY_ENGLISH_NAME.get(name);
  return item ? { name: item.name, description: item.description } : undefined;
};

/** Stable English source text for matching mechanics without depending on the active locale. */
export const erItemEnglishTextByKey = (itemKey: string): Pick<ErItem, "name" | "description"> | undefined => {
  const item = BASE_ITEM_BY_KEY.get(itemKey);
  return item ? { name: item.name, description: item.description } : undefined;
};

/** Per-item localized text, keyed by unique itemKey (group:id) — text only. */
export type ItemTextOverlay = Record<string, { name: string; description: string }>;

/** Swap item name/description to a localized overlay (or back to English with
 *  `null`). Stats, crafting, ids and icons are untouched. */
export const applyItemOverlay = (ov: ItemTextOverlay | null): void => {
  erItems = ov
    ? BASE_ITEMS.map((it) => {
        const e = ov[erItemKey(it)];
        return e ? { ...it, name: e.name, description: e.description } : it;
      })
    : BASE_ITEMS;
  erItemByKey = new Map(erItems.map((i) => [erItemKey(i), i]));
  erItemById = new Map(erItems.map((i) => [i.id, i]));
};
/** Resolve a crafting-material / recipe id (these are goods-group) with a safe fallback. */
export const erItemByBareId = (id: number): ErItem | undefined =>
  erItemByKey.get(`goods:${id}`) ?? erItemById.get(id);

export interface CategoryMeta {
  key: string;
  label: string;
  icon: string;
}

/** Codex category tabs, in display order. */
export const ER_ITEM_CATEGORIES: CategoryMeta[] = [
  { key: "weapon", label: "Weapons", icon: "sword" },
  { key: "armor", label: "Armor", icon: "fort" },
  { key: "talisman", label: "Talismans", icon: "talisman" },
  { key: "ash-of-war", label: "Ashes of War", icon: "ash-of-war" },
  { key: "sorcery", label: "Sorceries", icon: "sorcery" },
  { key: "incantation", label: "Incantations", icon: "incantation" },
  { key: "consumable", label: "Consumables", icon: "cookbook" },
  { key: "material", label: "Materials", icon: "smithing" },
  { key: "key", label: "Key Items", icon: "key" },
];

/**
 * Goods carry a raw `goods_type` enum (EquipParamGoods.goodsType) but — unlike weapons
 * ("Colossal Sword") and armor ("Chest") — no human subtype, so a consumable's page shows
 * only its name + prose with nothing saying WHAT KIND of thing it is. Map the enum to the
 * at-a-glance label the detail pages use as the item's subtype. Generic consumables
 * (type 0: pots, throwables, greases…) get no label — it'd just repeat the "Consumables"
 * heading — so only the distinctive kinds resolve. The effect NUMBERS (heal/buff/duration)
 * live in SpEffectParam, which the extractor doesn't read, so they're not available here.
 */
const GOODS_KIND: Record<number, string> = {
  3: "Remembrance",
  7: "Spirit Ash",
  8: "Spirit Ash",
  9: "Wondrous Physick",
  10: "Crystal Tear",
  12: "Info Item",
  14: "Upgrade Material",
  15: "Great Rune",
};
/** At-a-glance kind for a goods-group item, or undefined for generic/non-goods items. */
export const goodsKind = (it: ErItem): string | undefined =>
  it.goods_type == null ? undefined : GOODS_KIND[it.goods_type];

export const erCategoryColor: Record<string, string> = {
  weapon: "#c9b15a",
  armor: "#9c7b6b",
  talisman: "#c95a9b",
  "ash-of-war": "#c97e5a",
  sorcery: "#5a8ac9",
  incantation: "#c9a85a",
  consumable: "#5ac9a0",
  material: "#86c9a8",
  key: "#d6b85a",
};

export const erCategoryCounts = (): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const i of erItems) m[i.category] = (m[i.category] ?? 0) + 1;
  return m;
};
