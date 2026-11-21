import { migrateCategorySelection } from "./map-config";

export interface MapFilterPreferences {
  /** null uses the map defaults; an empty array deliberately hides all categories. */
  categories: string[] | null;
  hideCompleted: boolean;
  hideFavorites: boolean;
}

const CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v7:";
const REGION_PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v6:";
const QUEST_NPC_PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v5:";
const PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v4:";
const OLDER_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v3:";
const FIRST_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v2:";
const LEGACY_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:";
const HIDE_COMPLETED_STORAGE_KEY = "gm:hide-completed-locations";
const HIDE_FAVORITES_STORAGE_KEY = "gm:hide-favorite-locations";
const categoryStorageKey = (mapId: string) => `${CATEGORY_STORAGE_KEY_PREFIX}${mapId}`;
const withQuestNpcCategory = (categories: string[]) => [...new Set([...categories, "quest-npc"])];
const withRegionCategory = (categories: string[]) => [...new Set([...categories, "region"])];

const readStoredCategories = (mapId: string): string[] | null => {
  try {
    const stored = localStorage.getItem(categoryStorageKey(mapId));
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) return migrateCategorySelection(parsed);
    }
    const regionPrevious = localStorage.getItem(`${REGION_PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (regionPrevious) {
      const parsed = JSON.parse(regionPrevious) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = withRegionCategory(migrateCategorySelection(parsed));
        localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
        return migrated;
      }
    }
    const questNpcPrevious = localStorage.getItem(`${QUEST_NPC_PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (questNpcPrevious) {
      const parsed = JSON.parse(questNpcPrevious) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = withRegionCategory(withQuestNpcCategory(migrateCategorySelection(parsed)));
        localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
        return migrated;
      }
    }
    const previous = localStorage.getItem(`${PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (previous) {
      const parsed = JSON.parse(previous) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = withRegionCategory(withQuestNpcCategory(migrateCategorySelection(parsed.includes("boss") ? [...parsed, "dungeon-boss"] : parsed)));
        localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
        return migrated;
      }
    }
    const older = localStorage.getItem(`${OLDER_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (older) {
      const parsed = JSON.parse(older) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = withRegionCategory(withQuestNpcCategory(migrateCategorySelection(parsed.includes("boss") ? [...parsed, "dungeon-boss"] : parsed, true)));
        localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
        return migrated;
      }
    }
    const first = localStorage.getItem(`${FIRST_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (first) {
      const parsed = JSON.parse(first) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = withRegionCategory(withQuestNpcCategory(migrateCategorySelection([...parsed, ...(parsed.includes("boss") ? ["dungeon-boss"] : []), "enemy", "merchant"], true)));
        localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
        return migrated;
      }
    }
    const legacy = localStorage.getItem(`${LEGACY_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) return null;
    const migrated = withRegionCategory(withQuestNpcCategory(migrateCategorySelection([...parsed, "boss", "dungeon-boss", "enemy", "merchant"], true)));
    localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    console.warn("[MapFilters] Could not read saved categories.", error);
    return null;
  }
};

// Stable snapshots for React, keyed by map so switching maps never restores
// an old window-local selection. All map surfaces read the same storage keys.
const snapshots = new Map<string, MapFilterPreferences>();
const listeners = new Set<() => void>();

const invalidate = () => {
  snapshots.clear();
  for (const listener of listeners) listener();
};

export const subscribeMapFilterPreferences = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getMapFilterPreferences = (mapId: string): MapFilterPreferences => {
  let snapshot = snapshots.get(mapId);
  if (!snapshot) {
    snapshot = {
      categories: readStoredCategories(mapId),
      hideCompleted: localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === "true",
      hideFavorites: localStorage.getItem(HIDE_FAVORITES_STORAGE_KEY) === "true",
    };
    snapshots.set(mapId, snapshot);
  }
  return snapshot;
};

export const setMapFilterCategories = (mapId: string, categories: string[]): void => {
  localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(categories));
  invalidate();
};

export const toggleMapFilterHiddenLayer = (layer: "completed" | "favorites"): void => {
  const key = layer === "completed" ? HIDE_COMPLETED_STORAGE_KEY : HIDE_FAVORITES_STORAGE_KEY;
  localStorage.setItem(key, String(localStorage.getItem(key) !== "true"));
  invalidate();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === null || event.key.startsWith(LEGACY_CATEGORY_STORAGE_KEY_PREFIX)
      || event.key === HIDE_COMPLETED_STORAGE_KEY || event.key === HIDE_FAVORITES_STORAGE_KEY) {
      // Read only: receiving a change must never write stale values back.
      invalidate();
    }
  });
}

