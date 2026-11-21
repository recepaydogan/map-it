import type { UserMapMarker } from "./types";

export const FAVORITES_STORAGE_KEY = "gm:favorites";
export const MARKERS_STORAGE_KEY = "gm:user-markers";
export const NOTES_STORAGE_KEY = "gm:notes";
export const COMPLETED_LOCATIONS_STORAGE_KEY = "gm:completed-locations";
export const SAVED_MAP_STORAGE_VERSION_KEY = "gm:saved-state-version";
/** Bump when the stored shape changes; `migrateSavedMapStorage` re-sanitises on upgrade. */
export const SAVED_MAP_STORAGE_VERSION = 1;
export const SAVED_MAP_CHANGE_EVENT = "gm:saved-state-changed";

export const USER_MARKER_COLOR_IDS = ["sage", "amber", "red", "blue", "violet"];
export const USER_MARKER_ICON_IDS = ["pin", "home", "flag", "vehicle", "supplies", "danger"];
export const USER_MARKER_GROUP_IDS = ["general", "base", "resources", "travel", "danger"];

interface SavedMapStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedMapProgress {
  favoriteIds: string[];
  completedIds: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
}

type StoredRecord = Record<string, unknown>;

const readUnknown = (storage: SavedMapStorage, key: string, fallback: unknown) => {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
};

const isRecord = (value: unknown): value is StoredRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeLocationIds = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 160))]
  : [];

const sanitizeNotes = (value: unknown): Record<string, string> => isRecord(value)
  ? Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, string] => {
      const [id, note] = entry;
      return id.length <= 160 && typeof note === "string" && note.length <= 10_000;
    },
  ))
  : {};

const sanitizeMarkers = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const markerIds = new Set<string>();
  return value.flatMap((marker) => {
    if (!isRecord(marker)
      || typeof marker.id !== "string"
      || marker.id.length > 160
      || markerIds.has(marker.id)
      || typeof marker.name !== "string"
      || marker.name.length > 200
      || marker.category !== "custom"
      || marker.subtype !== "custom"
      || marker.regionId !== "personal"
      || typeof marker.label !== "string"
      || typeof marker.region !== "string"
      || typeof marker.x !== "number"
      || !Number.isFinite(marker.x)
      || Math.abs(marker.x) > 1_000_000
      || typeof marker.y !== "number"
      || !Number.isFinite(marker.y)
      || Math.abs(marker.y) > 1_000_000) return [];

    markerIds.add(marker.id);
    return [{
      id: marker.id,
      name: marker.name,
      category: "custom",
      label: marker.label,
      subtype: "custom",
      regionId: "personal",
      region: marker.region,
      x: marker.x,
      y: marker.y,
      ...(USER_MARKER_COLOR_IDS.includes(String(marker.color)) ? { color: marker.color } : {}),
      ...(USER_MARKER_ICON_IDS.includes(String(marker.icon)) ? { icon: marker.icon } : {}),
      group: USER_MARKER_GROUP_IDS.includes(String(marker.group)) ? marker.group : "general",
      ...(typeof marker.mapId === "string" && marker.mapId.length <= 180 ? { mapId: marker.mapId } : {}),
    }];
  });
};

export const sanitizeSavedMapProgress = (value: unknown): SavedMapProgress => {
  const progress = isRecord(value) ? value : {};
  return {
    favoriteIds: sanitizeLocationIds(progress.favoriteIds),
    completedIds: sanitizeLocationIds(progress.completedIds),
    markers: sanitizeMarkers(progress.markers) as UserMapMarker[],
    notes: sanitizeNotes(progress.notes),
  };
};

export const readSavedMapProgress = (
  storage: SavedMapStorage = localStorage,
): SavedMapProgress => sanitizeSavedMapProgress({
  favoriteIds: readUnknown(storage, FAVORITES_STORAGE_KEY, []),
  completedIds: readUnknown(storage, COMPLETED_LOCATIONS_STORAGE_KEY, []),
  markers: readUnknown(storage, MARKERS_STORAGE_KEY, []),
  notes: readUnknown(storage, NOTES_STORAGE_KEY, {}),
});

export const replaceSavedMapProgress = (
  progress: SavedMapProgress,
  storage: SavedMapStorage = localStorage,
): void => {
  const safe = sanitizeSavedMapProgress(progress);
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(safe.favoriteIds));
  storage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(safe.completedIds));
  storage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(safe.markers));
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(safe.notes));
  storage.setItem(SAVED_MAP_STORAGE_VERSION_KEY, String(SAVED_MAP_STORAGE_VERSION));
};

export const clearSavedMapProgress = (storage: SavedMapStorage = localStorage): void => {
  replaceSavedMapProgress({ favoriteIds: [], completedIds: [], markers: [], notes: {} }, storage);
};

/**
 * Re-validates everything the app persists whenever the storage version is
 * behind. Runs on every boot (cheap when up to date), so hand-edited or
 * corrupted entries can never crash a render.
 */
export const migrateSavedMapStorage = (storage: SavedMapStorage = localStorage) => {
  const storedVersion = Number(storage.getItem(SAVED_MAP_STORAGE_VERSION_KEY) ?? 0);
  if (Number.isInteger(storedVersion) && storedVersion >= SAVED_MAP_STORAGE_VERSION) {
    return SAVED_MAP_STORAGE_VERSION;
  }

  replaceSavedMapProgress(readSavedMapProgress(storage), storage);
  return SAVED_MAP_STORAGE_VERSION;
};
