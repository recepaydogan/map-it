import { useSyncExternalStore } from "react";
import { activeEventMarkerScaleByGroup, getCategoryConfig, MAP_CATEGORIES, MAP_CATEGORY_GROUPS, markerScaleByGroup, type MapCategoryGroupId } from "./map-config";
import type { MapPoint } from "./types";

const STORAGE_KEY = "gm:marker-group-sizes";
export const MARKER_SIZE_MIN_PERCENT = 50;
export const MARKER_SIZE_MAX_PERCENT = 200;
export const MARKER_SIZE_STEP_PERCENT = 10;
const DEFAULT_PERCENT = 100;
const categoryIds = new Set(MAP_CATEGORIES.map(({ id }) => id));

export interface MarkerSizeSettings {
  groups: Record<MapCategoryGroupId, number>;
  categories: Record<string, number>;
}

const defaults = (): MarkerSizeSettings => ({
  groups: Object.fromEntries(MAP_CATEGORY_GROUPS.map(({ id }) => [id, DEFAULT_PERCENT])) as MarkerSizeSettings["groups"],
  categories: {},
});
const DEFAULT_SIZES = defaults();

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
    return {
      groups: Object.fromEntries(MAP_CATEGORY_GROUPS.map(({ id }) => [id, normalize(rawGroups[id])])) as MarkerSizeSettings["groups"],
      categories: Object.fromEntries(Object.entries(rawCategories)
        .filter(([id, value]) => categoryIds.has(id) && typeof value === "number" && Number.isFinite(value))
        .map(([id, value]) => [id, normalize(value)])),
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
  () => DEFAULT_SIZES,
);

export const getMarkerCategorySizePercent = (categoryId: string, settings: MarkerSizeSettings): number =>
  settings.categories[categoryId] ?? settings.groups[getCategoryConfig(categoryId).groupId];

export const getMarkerScale = (point: MapPoint, settings: MarkerSizeSettings, activeEvent = false): number => {
  const category = getCategoryConfig(point.category);
  return getMarkerCategorySizePercent(point.category, settings) / 100
    * (category.markerScale ?? markerScaleByGroup.get(category.groupId) ?? 1)
    * (activeEvent ? activeEventMarkerScaleByGroup.get(category.groupId) ?? 1 : 1);
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sizes = read();
    notify();
  });
}
