import type { SavedLootRun, SavedMapRoute, UserMapMarker } from "./types";
import { USER_MARKER_GROUP_IDS } from "./types.ts";
import { MAX_ROUTE_NAME_LENGTH } from "./map-route-utils.ts";
import { MAX_STORED_LOOT_RUN_ITEMS } from "./loot-run-planner/loot-run-constants.ts";

export const SAVED_MAP_BACKUP_VERSION = 5;

export interface SavedMapBackup {
  schemaVersion: typeof SAVED_MAP_BACKUP_VERSION;
  app: "project-zomboid-interactive-map";
  exportedAt: string;
  favoriteIds: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
  routes: SavedMapRoute[];
  lootRuns: SavedLootRun[];
  lootedLocationIds: string[];
}

export interface SavedMapImportResult {
  favoriteCount: number;
  markerCount: number;
  noteCount: number;
  routeCount: number;
  lootRunCount: number;
  lootedLocationCount: number;
}

interface SavedMapState {
  favoriteIds: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
  routes: SavedMapRoute[];
  lootRuns: SavedLootRun[];
  lootedLocationIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeText = (value: unknown, maximumLength: number): value is string =>
  typeof value === "string" && value.length <= maximumLength;

const isUserMapMarker = (value: unknown): value is UserMapMarker => {
  if (!isRecord(value)) return false;
  return isSafeText(value.id, 160)
    && isSafeText(value.name, 200)
    && value.category === "custom"
    && isSafeText(value.label, 200)
    && value.subtype === "custom"
    && isSafeText(value.townId, 160)
    && isSafeText(value.town, 200)
    && typeof value.x === "number"
    && Number.isFinite(value.x)
    && Math.abs(value.x) <= 100_000
    && typeof value.y === "number"
    && Number.isFinite(value.y)
    && Math.abs(value.y) <= 100_000
    && (value.color === undefined || ["sage", "amber", "red", "blue", "violet"].includes(String(value.color)))
    && (value.icon === undefined || ["pin", "home", "flag", "vehicle", "supplies", "danger"].includes(String(value.icon)))
    && (value.imageCategory === undefined || isSafeText(value.imageCategory, 100))
    && (value.group === undefined || USER_MARKER_GROUP_IDS.some((group) => group === value.group))
    && (value.mapId === undefined || isSafeText(value.mapId, 180));
};

const isSavedMapRoute = (value: unknown): value is SavedMapRoute => {
  if (!isRecord(value)
    || !isSafeText(value.id, 160)
    || !isSafeText(value.mapId, 180)
    || (value.name !== undefined && !isSafeText(value.name, MAX_ROUTE_NAME_LENGTH))
    || !Array.isArray(value.points)
    || value.points.length > 32
    || (value.source !== undefined && value.source !== "loot-run")
    || (value.lootRunId !== undefined
      && (value.source !== "loot-run" || !isSafeText(value.lootRunId, 160)))
    || !isSafeText(value.updatedAt, 40)) return false;
  const waypointIds = new Set<string>();
  return value.points.every((point) => {
    if (!isRecord(point)
      || !isSafeText(point.id, 160)
      || waypointIds.has(point.id)
      || typeof point.x !== "number"
      || !Number.isFinite(point.x)
      || Math.abs(point.x) > 100_000
      || typeof point.y !== "number"
      || !Number.isFinite(point.y)
      || Math.abs(point.y) > 100_000
      || (point.label !== undefined && !isSafeText(point.label, 200))) return false;
    waypointIds.add(point.id);
    return true;
  });
};

const isSavedLootRun = (value: unknown): value is SavedLootRun => {
  if (!isRecord(value)
    || !isSafeText(value.id, 160)
    || !isSafeText(value.mapId, 180)
    || !isSafeText(value.itemId, 180)
    || !isSafeText(value.itemName, 200)
    || !Array.isArray(value.locationIds)
    || !Array.isArray(value.completedLocationIds)
    || !isSafeText(value.createdAt, 40)
    || !isSafeText(value.updatedAt, 40)) return false;
  if (value.items !== undefined && (
    !Array.isArray(value.items)
    || value.items.length < 1
    || value.items.length > MAX_STORED_LOOT_RUN_ITEMS
    || !value.items.every((item) => isRecord(item)
      && isSafeText(item.id, 180)
      && isSafeText(item.name, 200))
    || new Set(value.items.map((item) => (item as { id: string }).id)).size !== value.items.length
  )) return false;
  const locationIds = value.locationIds;
  const completedLocationIds = value.completedLocationIds;
  if (
    locationIds.length < 1
    || locationIds.length > 32
    || !locationIds.every((id) => isSafeText(id, 160))
    || new Set(locationIds).size !== locationIds.length
    || !completedLocationIds.every(
      (id) => isSafeText(id, 160) && locationIds.includes(id),
    )) return false;
  return true;
};

const parseBackup = (source: string): SavedMapBackup => {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed)
    || ![1, 2, 3, 4, SAVED_MAP_BACKUP_VERSION].includes(Number(parsed.schemaVersion))
    || parsed.app !== "project-zomboid-interactive-map"
    || !Array.isArray(parsed.favoriteIds)
    || !parsed.favoriteIds.every((id) => isSafeText(id, 160))
    || !Array.isArray(parsed.markers)
    || !parsed.markers.every(isUserMapMarker)
    || !isRecord(parsed.notes)
    || !Object.entries(parsed.notes).every(([id, note]) => isSafeText(id, 160) && isSafeText(note, 10_000))
    || (Number(parsed.schemaVersion) >= 2
      && (!Array.isArray(parsed.routes) || !parsed.routes.every(isSavedMapRoute)))
    || (Number(parsed.schemaVersion) >= 3
      && (!Array.isArray(parsed.lootRuns) || !parsed.lootRuns.every(isSavedLootRun)))
    || (Number(parsed.schemaVersion) >= 4
      && (!Array.isArray(parsed.lootedLocationIds)
        || !parsed.lootedLocationIds.every((id) => isSafeText(id, 160))))) {
    throw new Error("Invalid Project Zomboid map backup.");
  }
  const lootRuns = Number(parsed.schemaVersion) >= 3
    ? (parsed.lootRuns as SavedLootRun[]).map((run) => ({
      ...run,
      items: Array.isArray(run.items) && run.items.length > 0
        ? run.items
        : [{ id: run.itemId, name: run.itemName }],
    }))
    : [];
  return {
    ...(parsed as unknown as Omit<SavedMapBackup, "schemaVersion" | "routes" | "lootRuns">),
    schemaVersion: SAVED_MAP_BACKUP_VERSION,
    routes: Number(parsed.schemaVersion) >= 2
      ? parsed.routes as SavedMapRoute[]
      : [],
    lootRuns,
    lootedLocationIds: Number(parsed.schemaVersion) >= 4
      ? parsed.lootedLocationIds as string[]
      : [],
  };
};

export const serializeSavedMapBackup = ({
  favoriteIds,
  markers,
  notes,
  routes,
  lootRuns,
  lootedLocationIds,
}: SavedMapState): string =>
  JSON.stringify({
    schemaVersion: SAVED_MAP_BACKUP_VERSION,
    app: "project-zomboid-interactive-map",
    exportedAt: new Date().toISOString(),
    favoriteIds,
    markers,
    notes,
    routes,
    lootRuns,
    lootedLocationIds,
  } satisfies SavedMapBackup, null, 2);

export const mergeSavedMapBackup = (
  source: string,
  current: SavedMapState,
): { state: SavedMapState; result: SavedMapImportResult } => {
  const incoming = parseBackup(source);
  const existingMarkerIds = new Set(current.markers.map((marker) => marker.id));
  const importedMarkers = incoming.markers.filter((marker) => !existingMarkerIds.has(marker.id));
  const favoriteIds = [...new Set([...current.favoriteIds, ...incoming.favoriteIds])];
  const notes = { ...incoming.notes, ...current.notes };
  const existingRouteIds = new Set(current.routes.map(({ id }) => id));
  const importedRoutes = incoming.routes.filter(({ id }) => !existingRouteIds.has(id));
  const existingLootRunIds = new Set(current.lootRuns.map(({ id }) => id));
  const importedLootRuns = incoming.lootRuns.filter(
    ({ id }) => !existingLootRunIds.has(id),
  );
  const lootedLocationIds = [...new Set([
    ...current.lootedLocationIds,
    ...incoming.lootedLocationIds,
  ])];

  return {
    state: {
      favoriteIds,
      markers: [...current.markers, ...importedMarkers],
      notes,
      routes: [...current.routes, ...importedRoutes],
      lootRuns: [...current.lootRuns, ...importedLootRuns],
      lootedLocationIds,
    },
    result: {
      favoriteCount: favoriteIds.length - current.favoriteIds.length,
      markerCount: importedMarkers.length,
      noteCount: Object.keys(notes).length - Object.keys(current.notes).length,
      routeCount: importedRoutes.length,
      lootRunCount: importedLootRuns.length,
      lootedLocationCount: lootedLocationIds.length - current.lootedLocationIds.length,
    },
  };
};
