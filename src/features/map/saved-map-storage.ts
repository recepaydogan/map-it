export const FAVORITES_STORAGE_KEY = "map-it:favorites";
export const MARKERS_STORAGE_KEY = "map-it:user-markers";
export const NOTES_STORAGE_KEY = "map-it:notes";
export const COMPLETED_LOCATIONS_STORAGE_KEY = "map-it:completed-locations";
export const SAVED_MAP_STORAGE_VERSION_KEY = "map-it:saved-state-version";
/** Bump when the stored shape changes; `migrateSavedMapStorage` re-sanitises on upgrade. */
export const SAVED_MAP_STORAGE_VERSION = 2;

export const USER_MARKER_ICON_IDS = [
  "pin", "city", "town", "dungeon", "graveyard", "innkeeper", "merchant",
  "auctioneer", "banker", "repair-vendor", "profession-trainer", "flight-master",
  "quest", "treasure", "mailbox", "stable-master", "barber-shop",
  "transmogrifier", "class-trainer", "battlemaster", "bank", "repeatable-quest", "boss",
  // Previously saved personal markers retain their original IDs.
  "home", "flag", "vehicle", "supplies", "danger",
];
export const USER_MARKER_GROUP_IDS = ["general", "base", "resources", "travel", "danger"];

interface SavedMapStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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

const sanitizeNotes = (value: unknown) => isRecord(value)
  ? Object.fromEntries(Object.entries(value).filter(
    ([id, note]) => id.length <= 160 && typeof note === "string" && note.length <= 10_000,
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
      ...(USER_MARKER_ICON_IDS.includes(String(marker.icon)) ? { icon: marker.icon } : {}),
      group: USER_MARKER_GROUP_IDS.includes(String(marker.group)) ? marker.group : "general",
      ...(typeof marker.mapId === "string" && marker.mapId.length <= 180 ? { mapId: marker.mapId } : {}),
    }];
  });
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

  const favorites = sanitizeLocationIds(readUnknown(storage, FAVORITES_STORAGE_KEY, []));
  const completed = sanitizeLocationIds(readUnknown(storage, COMPLETED_LOCATIONS_STORAGE_KEY, []));
  const notes = sanitizeNotes(readUnknown(storage, NOTES_STORAGE_KEY, {}));
  const markers = sanitizeMarkers(readUnknown(storage, MARKERS_STORAGE_KEY, []));

  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  storage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(completed));
  storage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  storage.setItem(SAVED_MAP_STORAGE_VERSION_KEY, String(SAVED_MAP_STORAGE_VERSION));
  return SAVED_MAP_STORAGE_VERSION;
};
