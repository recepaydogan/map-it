import { useSyncExternalStore } from "react";
import { getCategoryConfig, MAP_CATEGORIES, MAP_CATEGORY_GROUPS, type MapCategoryGroupId } from "./map-config";
import type { MapPoint } from "./types";
import { getTrainerFilterCategory } from "./map-trainer-filters";

const STORAGE_KEY = "gm:marker-group-sizes";
export const MARKER_SIZE_MIN_PERCENT = 50;
export const MARKER_SIZE_MAX_PERCENT = 200;
export const MARKER_SIZE_STEP_PERCENT = 10;
const DEFAULT_PERCENT = 100;
const categoryIds = new Set(MAP_CATEGORIES.map(({ id }) => id));
const PREVIOUS_GROUPS: Record<string, string> = {
  dungeon: "places", raid: "places",
  "class-trainer": "services", "profession-trainer": "services", "barber-shop": "services",
  transmogrifier: "services", "stable-master": "services", battlemaster: "services",
  "battleground-objective": "progression", npc: "npcs",
};
const MERGED_NPC_GROUPS: Record<string, string> = {
  npc: "progression", battlemaster: "places",
  merchant: "trade", auctioneer: "trade", banker: "trade", bank: "trade",
  "bank-sign": "trade", "repair-vendor": "trade",
  "barber-shop": "character", transmogrifier: "character", "stable-master": "character",
  innkeeper: "services", mailbox: "services", "guild-vault": "services",
};

export interface MarkerSizeSettings {
  version: 5;
  groups: Record<MapCategoryGroupId, number>;
  categories: Record<string, number>;
}

const defaults = (): MarkerSizeSettings => ({
  version: 5,
  groups: Object.fromEntries(MAP_CATEGORY_GROUPS.map(({ id }) => [id, DEFAULT_PERCENT])) as MarkerSizeSettings["groups"],
  categories: {},
});
export const DEFAULT_MARKER_SIZES = defaults();

const normalize = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PERCENT;
  const stepped = Math.round(value / MARKER_SIZE_STEP_PERCENT) * MARKER_SIZE_STEP_PERCENT;
  return Math.min(MARKER_SIZE_MAX_PERCENT, Math.max(MARKER_SIZE_MIN_PERCENT, stepped));
};

const read = (): MarkerSizeSettings => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    const values = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
    // The first version stored group percentages directly at the root.
    const rawGroups = values.groups && typeof values.groups === "object"
      ? values.groups as Record<string, unknown> : values;
    const rawCategories = values.categories && typeof values.categories === "object"
      ? values.categories as Record<string, unknown> : {};
    const legacy = values.version !== 2 && values.version !== 3 && values.version !== 4 && values.version !== 5;
    const groups = Object.fromEntries(MAP_CATEGORY_GROUPS.map(({ id }) => [id, normalize(rawGroups[id]
      ?? (id === "npcs" ? rawGroups.trade : undefined)
      ?? ((id === "class-trainers" || id === "profession-trainers") ? rawGroups.character : undefined)
      ?? (legacy && id === "dungeons" ? rawGroups.places : undefined)
      ?? (legacy && id === "pvp" ? rawGroups.services : undefined))])) as MarkerSizeSettings["groups"];
    const categories: Record<string, number> = Object.fromEntries(Object.entries(rawCategories)
      .filter(([id, value]) => categoryIds.has(id) && typeof value === "number" && Number.isFinite(value))
      .map(([id, value]) => [id, normalize(value)]));
    if (legacy) {
      for (const [id, oldGroup] of Object.entries(PREVIOUS_GROUPS)) {
        if (categories[id] !== undefined || rawGroups[oldGroup] === undefined) continue;
        const oldSize = normalize(rawGroups[oldGroup]);
        if (oldSize !== groups[getCategoryConfig(id).groupId]) categories[id] = oldSize;
      }
    }
    if (values.version !== 5) {
      for (const [id, previousGroup] of Object.entries(MERGED_NPC_GROUPS)) {
        if (categories[id] !== undefined) continue;
        const oldGroup = legacy ? PREVIOUS_GROUPS[id] ?? previousGroup
          : id === "npc" && values.version !== 4 ? "npcs"
          : id === "battlemaster" && (values.version === 2 || values.version === 3) ? "pvp"
          : previousGroup;
        if (typeof rawGroups[oldGroup] !== "number") continue;
        const oldSize = normalize(rawGroups[oldGroup]);
        if (oldSize !== groups.npcs) categories[id] = oldSize;
      }
    }
    if (values.version === 2 && categories.graveyard === undefined) {
      const previousSize = normalize(rawGroups.teleportation);
      if (previousSize !== groups.places) categories.graveyard = previousSize;
    }
    if ((values.version === 2 || values.version === 3) && categories.battlemaster === undefined) {
      const previousSize = normalize(rawGroups.pvp);
      if (previousSize !== groups.places) categories.battlemaster = previousSize;
    }
    return {
      version: 5,
      groups,
      categories,
    };
  } catch {
    return defaults();
  }
};

const listeners = new Set<() => void>();
let sizes = typeof window === "undefined" ? defaults() : read();
const notify = () => { for (const listener of listeners) listener(); };
const save = (next: MarkerSizeSettings) => {
  sizes = next;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the setting for this window. */ }
  notify();
};

export const setMarkerGroupSizePercent = (group: MapCategoryGroupId, value: number) => {
  const next = normalize(value);
  if (sizes.groups[group] !== next) save({ ...sizes, groups: { ...sizes.groups, [group]: next } });
};

export const setMarkerCategorySizePercent = (ids: readonly string[], value: number) => {
  const next = normalize(value);
  const categories = { ...sizes.categories };
  for (const id of ids) {
    if (!categoryIds.has(id)) continue;
    if (next === sizes.groups[getCategoryConfig(id).groupId]) delete categories[id];
    else categories[id] = next;
  }
  save({ ...sizes, categories });
};

export const clearMarkerCategorySizes = (ids: readonly string[]) => {
  const categories = { ...sizes.categories };
  for (const id of ids) delete categories[id];
  save({ ...sizes, categories });
};

export const resetMarkerSizes = () => save(defaults());

export const useMarkerSizes = (): MarkerSizeSettings => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => sizes,
  () => DEFAULT_MARKER_SIZES,
);

export const getMarkerCategorySizePercent = (categoryId: string, settings: MarkerSizeSettings): number =>
  settings.categories[categoryId] ?? settings.groups[getCategoryConfig(categoryId).groupId];

export const getMarkerScale = (point: MapPoint, settings: MarkerSizeSettings): number => {
  const group = getCategoryConfig(point.category).groupId;
  return getMarkerCategorySizePercent(getTrainerFilterCategory(point) ?? point.category, settings) / 100
    * (group === "herbs" || group === "fishing" || group === "cloth" || group === "leather"
      ? 0.625 : group === "mining" ? 0.5 : 1);
};

/** Linked quest offers remain smaller than their quest giver at close zoom. */
export const getMapPointMarkerScale = (point: MapPoint, settings: MarkerSizeSettings): number => {
  const scale = getMarkerScale(point, settings);
  return "questGiverMarkerId" in point && point.questGiverMarkerId
    ? Math.min(scale, 1) * 0.72 : scale;
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sizes = read();
    notify();
  });
}
