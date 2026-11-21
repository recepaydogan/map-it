export const FAVORITES_STORAGE_KEY = "gm:favorites";
export const MARKERS_STORAGE_KEY = "gm:user-markers";
export const NOTES_STORAGE_KEY = "gm:notes";
export const COMPLETED_LOCATIONS_STORAGE_KEY = "gm:completed-locations";
export const SAVED_MAP_STORAGE_VERSION_KEY = "gm:saved-state-version";
/** Bump when the stored shape changes; `migrateSavedMapStorage` re-sanitises on upgrade. */
export const SAVED_MAP_STORAGE_VERSION = 1;
export const LOCATION_ALIAS_BACKUP_PREFIX = "gm:location-alias-backup:";

export const USER_MARKER_COLOR_IDS = ["sage", "amber", "red", "blue", "violet"];
export const USER_MARKER_ICON_IDS = ["pin", "home", "flag", "vehicle", "supplies", "danger"];
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
      ...(USER_MARKER_COLOR_IDS.includes(String(marker.color)) ? { color: marker.color } : {}),
      ...(USER_MARKER_ICON_IDS.includes(String(marker.icon)) ? { icon: marker.icon } : {}),
      group: USER_MARKER_GROUP_IDS.includes(String(marker.group)) ? marker.group : "general",
      ...(typeof marker.mapId === "string" && marker.mapId.length <= 180 ? { mapId: marker.mapId } : {}),
    }];
  });
};

/** Redirect retired duplicate IDs without touching personal markers or losing
 * conflicting notes. Keep every legacy note and a pre-write storage snapshot. */
const migrateLocationAliases = (storage: SavedMapStorage, aliases: Readonly<Record<string, string>>) => {
  for (const [legacyId, targetId] of Object.entries(aliases)) {
    if (!legacyId || !targetId || legacyId.length > 160 || targetId.length > 160
      || legacyId === targetId || Object.hasOwn(aliases, targetId)
      || legacyId.startsWith("custom-") || targetId.startsWith("custom-")) {
      throw new Error(`Invalid direct location alias: ${legacyId}`);
    }
    const storedFavorites = storage.getItem(FAVORITES_STORAGE_KEY);
    const storedCompleted = storage.getItem(COMPLETED_LOCATIONS_STORAGE_KEY);
    const storedNotes = storage.getItem(NOTES_STORAGE_KEY);
    const favorites: string[] = JSON.parse(storedFavorites ?? "[]");
    const completed: string[] = JSON.parse(storedCompleted ?? "[]");
    const notes: Record<string, string> = JSON.parse(storedNotes ?? "{}");
    if (!Array.isArray(favorites) || !Array.isArray(completed) || !isRecord(notes)) {
      throw new Error("Invalid saved map state during location alias migration");
    }
    const backupKey = `${LOCATION_ALIAS_BACKUP_PREFIX}${legacyId}`;
    const noteHandledKey = `${backupKey}:notes-handled`;
    const favoriteChanged = favorites.includes(legacyId), completedChanged = completed.includes(legacyId);
    const notePending = typeof notes[legacyId] === "string" && storage.getItem(noteHandledKey) !== targetId;
    const copyNote = notePending && !Object.hasOwn(notes, targetId);
    if (!favoriteChanged && !completedChanged && !notePending) continue;
    if (storage.getItem(backupKey) === null) storage.setItem(backupKey, JSON.stringify({
      legacyId, targetId, favorites: storedFavorites, completed: storedCompleted, notes: storedNotes,
    }));
    const redirect = (ids: string[]) => [...new Set(ids.map((id) => id === legacyId ? targetId : id))];
    if (favoriteChanged) storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(redirect(favorites)));
    if (completedChanged) storage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(redirect(completed)));
    // Never concatenate/truncate two user notes or overwrite the target's note.
    // The legacy note remains verbatim under its original key even after copying.
    if (copyNote) storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ ...notes, [targetId]: notes[legacyId] }));
    // Deleting a copied note later is an intentional edit, not a reason to
    // resurrect it from the retained legacy key on the next refresh.
    if (notePending) storage.setItem(noteHandledKey, targetId);
  }
};

/**
 * Re-validates everything the app persists whenever the storage version is
 * behind. Runs on every boot (cheap when up to date), so hand-edited or
 * corrupted entries can never crash a render.
 */
export const migrateSavedMapStorage = (
  storage: SavedMapStorage = localStorage,
  aliases: Readonly<Record<string, string>> = {},
) => {
  const storedVersion = Number(storage.getItem(SAVED_MAP_STORAGE_VERSION_KEY) ?? 0);
  if (Number.isInteger(storedVersion) && storedVersion >= SAVED_MAP_STORAGE_VERSION) {
    migrateLocationAliases(storage, aliases);
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
  migrateLocationAliases(storage, aliases);
  return SAVED_MAP_STORAGE_VERSION;
};
