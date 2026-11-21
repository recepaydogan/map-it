import { MAX_ROUTE_NAME_LENGTH } from "./map-route-utils.ts";
import { USER_MARKER_GROUP_IDS } from "./types.ts";
import { MAX_STORED_LOOT_RUN_ITEMS } from "./loot-run-planner/loot-run-constants.ts";

export const FAVORITES_STORAGE_KEY = "pzim:favorites";
export const MARKERS_STORAGE_KEY = "pzim:user-markers";
export const NOTES_STORAGE_KEY = "pzim:notes";
export const ROUTES_STORAGE_KEY = "pzim:routes";
export const LOOT_RUNS_STORAGE_KEY = "pzim:loot-runs";
export const LOOTED_LOCATIONS_STORAGE_KEY = "pzim:looted-locations";
export const SAVED_MAP_STORAGE_VERSION_KEY = "pzim:saved-state-version";
export const SAVED_MAP_STORAGE_VERSION = 10;

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

const sanitizeMarkers = (value: unknown, addDefaultGroup: boolean, addDefaultMap: boolean) => {
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
      || marker.townId !== "personal"
      || typeof marker.label !== "string"
      || typeof marker.town !== "string"
      || typeof marker.x !== "number"
      || !Number.isFinite(marker.x)
      || Math.abs(marker.x) > 100_000
      || typeof marker.y !== "number"
      || !Number.isFinite(marker.y)
      || Math.abs(marker.y) > 100_000) return [];

    markerIds.add(marker.id);
    return [{
      ...marker,
      ...(addDefaultGroup && !USER_MARKER_GROUP_IDS.some((group) => group === marker.group) ? { group: "general" } : {}),
      ...(addDefaultMap && typeof marker.mapId !== "string" ? { mapId: "builtin:knox-country" } : {}),
    }];
  });
};

const sanitizeRoutes = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const routeIds = new Set<string>();
  return value.flatMap((route) => {
    if (!isRecord(route)
      || typeof route.id !== "string"
      || route.id.length > 160
      || typeof route.mapId !== "string"
      || route.mapId.length > 180
      || routeIds.has(route.id)
      || !Array.isArray(route.points)
      || route.points.length > 32
      || (route.name !== undefined
        && (typeof route.name !== "string" || route.name.length > MAX_ROUTE_NAME_LENGTH))
      || (route.source !== undefined && route.source !== "loot-run")
      || (route.lootRunId !== undefined
        && (route.source !== "loot-run" || typeof route.lootRunId !== "string" || route.lootRunId.length > 160))) return [];
    const waypointIds = new Set<string>();
    const points = route.points.flatMap((point) => {
      if (!isRecord(point)
        || typeof point.id !== "string"
        || point.id.length > 160
        || waypointIds.has(point.id)
        || typeof point.x !== "number"
        || !Number.isFinite(point.x)
        || Math.abs(point.x) > 100_000
        || typeof point.y !== "number"
        || !Number.isFinite(point.y)
        || Math.abs(point.y) > 100_000
        || (point.label !== undefined && (typeof point.label !== "string" || point.label.length > 200))) return [];
      waypointIds.add(point.id);
      return [{ id: point.id, x: point.x, y: point.y, ...(point.label ? { label: point.label } : {}) }];
    });
    if (points.length === 0) return [];
    routeIds.add(route.id);
    return [{
      id: route.id,
      mapId: route.mapId,
      ...(typeof route.name === "string" && route.name.trim()
        ? { name: route.name.trim() }
        : {}),
      points,
      ...(route.source === "loot-run" ? { source: route.source } : {}),
      ...(typeof route.lootRunId === "string" ? { lootRunId: route.lootRunId } : {}),
      updatedAt: typeof route.updatedAt === "string" && route.updatedAt.length <= 40
        ? route.updatedAt
        : new Date(0).toISOString(),
    }];
  });
};

const sanitizeLootRuns = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const runIds = new Set<string>();
  return value.flatMap((run) => {
    if (!isRecord(run)
      || typeof run.id !== "string"
      || run.id.length > 160
      || runIds.has(run.id)
      || typeof run.mapId !== "string"
      || run.mapId.length > 180
      || typeof run.itemId !== "string"
      || run.itemId.length > 180
      || typeof run.itemName !== "string"
      || run.itemName.length > 200
      || !Array.isArray(run.locationIds)
      || !Array.isArray(run.completedLocationIds)) return [];
    const rawItems = Array.isArray(run.items)
      ? run.items
      : [{ id: run.itemId, name: run.itemName }];
    const itemIds = new Set<string>();
    const items = rawItems.flatMap((item) => {
      if (!isRecord(item)
        || typeof item.id !== "string"
        || item.id.length > 180
        || itemIds.has(item.id)
        || typeof item.name !== "string"
        || item.name.length > 200) return [];
      itemIds.add(item.id);
      return [{ id: item.id, name: item.name }];
    }).slice(0, MAX_STORED_LOOT_RUN_ITEMS);
    const locationIds = run.locationIds;
    const completedLocationIds = run.completedLocationIds;
    if (items.length < 1
      || locationIds.length < 1
      || locationIds.length > 32
      || !locationIds.every((id) => typeof id === "string" && id.length <= 160)
      || new Set(locationIds).size !== locationIds.length
      || !completedLocationIds.every(
        (id) => typeof id === "string" && locationIds.includes(id),
      )) return [];
    runIds.add(run.id);
    return [{
      id: run.id,
      mapId: run.mapId,
      itemId: items[0]!.id,
      itemName: items[0]!.name,
      items,
      locationIds,
      completedLocationIds: [...new Set(completedLocationIds)],
      createdAt: typeof run.createdAt === "string" && run.createdAt.length <= 40
        ? run.createdAt
        : new Date(0).toISOString(),
      updatedAt: typeof run.updatedAt === "string" && run.updatedAt.length <= 40
        ? run.updatedAt
        : new Date(0).toISOString(),
    }];
  });
};

export const migrateSavedMapStorage = (storage: SavedMapStorage = localStorage) => {
  const storedVersion = Number(storage.getItem(SAVED_MAP_STORAGE_VERSION_KEY) ?? 0);
  if (Number.isInteger(storedVersion) && storedVersion >= SAVED_MAP_STORAGE_VERSION) {
    return SAVED_MAP_STORAGE_VERSION;
  }

  const favorites = sanitizeLocationIds(readUnknown(storage, FAVORITES_STORAGE_KEY, []));
  const lootedLocations = sanitizeLocationIds(readUnknown(storage, LOOTED_LOCATIONS_STORAGE_KEY, []));
  const notes = sanitizeNotes(readUnknown(storage, NOTES_STORAGE_KEY, {}));
  const routes = sanitizeRoutes(readUnknown(storage, ROUTES_STORAGE_KEY, []));
  const lootRuns = sanitizeLootRuns(readUnknown(storage, LOOT_RUNS_STORAGE_KEY, []));
  const markers = sanitizeMarkers(
    readUnknown(storage, MARKERS_STORAGE_KEY, []),
    storedVersion < 2,
    storedVersion < 3,
  );

  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  storage.setItem(LOOTED_LOCATIONS_STORAGE_KEY, JSON.stringify(lootedLocations));
  storage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  storage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
  storage.setItem(LOOT_RUNS_STORAGE_KEY, JSON.stringify(lootRuns));
  storage.setItem(SAVED_MAP_STORAGE_VERSION_KEY, String(SAVED_MAP_STORAGE_VERSION));
  return SAVED_MAP_STORAGE_VERSION;
};
