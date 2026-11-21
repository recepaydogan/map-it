import { useCallback, useEffect, useState } from "react";
import {
  FAVORITES_STORAGE_KEY,
  LOOTED_LOCATIONS_STORAGE_KEY,
  LOOT_RUNS_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  migrateSavedMapStorage,
  NOTES_STORAGE_KEY,
  ROUTES_STORAGE_KEY,
} from "./saved-map-storage";
import type {
  MapCoordinate,
  SavedLootRun,
  SavedLootRunItem,
  SavedMapRoute,
  UserMapMarker,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";
import {
  MAX_ROUTE_NAME_LENGTH,
  MAX_ROUTE_WAYPOINTS,
  MAX_SAVED_ROUTES_PER_MAP,
} from "./map-route-utils";
import { MAX_STORED_LOOT_RUN_ITEMS } from "./loot-run-planner/loot-run-constants";

const CHANGE_EVENT = "pzim:saved-state-changed";
const SAVED_STATE_STORAGE_KEYS = new Set<string>([
  FAVORITES_STORAGE_KEY,
  LOOTED_LOCATIONS_STORAGE_KEY,
  LOOT_RUNS_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  ROUTES_STORAGE_KEY,
]);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const notifyChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));

export const useSavedMapState = () => {
  migrateSavedMapStorage();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readJson(FAVORITES_STORAGE_KEY, []));
  const [markers, setMarkers] = useState<UserMapMarker[]>(() => readJson(MARKERS_STORAGE_KEY, []));
  const [notes, setNotes] = useState<Record<string, string>>(() => readJson(NOTES_STORAGE_KEY, {}));
  const [routes, setRoutes] = useState<SavedMapRoute[]>(() => readJson(ROUTES_STORAGE_KEY, []));
  const [lootRuns, setLootRuns] = useState<SavedLootRun[]>(() => readJson(LOOT_RUNS_STORAGE_KEY, []));
  const [lootedLocationIds, setLootedLocationIds] = useState<string[]>(
    () => readJson(LOOTED_LOCATIONS_STORAGE_KEY, []),
  );

  const refresh = useCallback(() => {
    setFavoriteIds(readJson(FAVORITES_STORAGE_KEY, []));
    setMarkers(readJson(MARKERS_STORAGE_KEY, []));
    setNotes(readJson(NOTES_STORAGE_KEY, {}));
    setRoutes(readJson(ROUTES_STORAGE_KEY, []));
    setLootRuns(readJson(LOOT_RUNS_STORAGE_KEY, []));
    setLootedLocationIds(readJson(LOOTED_LOCATIONS_STORAGE_KEY, []));
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && !SAVED_STATE_STORAGE_KEYS.has(event.key)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [refresh]);

  const toggleFavorite = useCallback((id: string) => {
    const current = readJson<string[]>(FAVORITES_STORAGE_KEY, []);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const toggleLooted = useCallback((id: string) => {
    const current = readJson<string[]>(LOOTED_LOCATIONS_STORAGE_KEY, []);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(LOOTED_LOCATIONS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const saveMarker = useCallback((marker: UserMapMarker, note: string) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const exists = current.some(({ id }) => id === marker.id);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(exists
      ? current.map((item) => item.id === marker.id ? marker : item)
      : [...current, marker]));
    const notes = readJson<Record<string, string>>(NOTES_STORAGE_KEY, {});
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ ...notes, [marker.id]: note }));
    notifyChange();
  }, []);

  const renameMarker = useCallback((id: string, name: string) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const next = current.map((marker) => marker.id === id ? { ...marker, name } : marker);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const updateMarkerStyle = useCallback((id: string, change: UserMarkerStyleChange) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const next = current.map((marker) => marker.id === id ? { ...marker, ...change } : marker);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const updateMarkerGroup = useCallback((id: string, group: UserMarkerGroup) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const next = current.map((marker) => marker.id === id ? { ...marker, group } : marker);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const removeMarker = useCallback((id: string) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(current.filter((marker) => marker.id !== id)));
    const nextNotes = { ...readJson<Record<string, string>>(NOTES_STORAGE_KEY, {}) };
    delete nextNotes[id];
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes));
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(FAVORITES_STORAGE_KEY, []).filter((favoriteId) => favoriteId !== id)),
    );
    localStorage.setItem(
      LOOTED_LOCATIONS_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(LOOTED_LOCATIONS_STORAGE_KEY, []).filter((locationId) => locationId !== id)),
    );
    notifyChange();
  }, []);

  const saveNote = useCallback((id: string, note: string) => {
    const current = readJson<Record<string, string>>(NOTES_STORAGE_KEY, {});
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ ...current, [id]: note }));
    notifyChange();
  }, []);

  const saveRoute = useCallback((
    mapId: string,
    points: Array<MapCoordinate & { label?: string }>,
  ) => {
    const current = readJson<SavedMapRoute[]>(ROUTES_STORAGE_KEY, []);
    if (points.length < 2
      || current.filter((route) => route.mapId === mapId).length >= MAX_SAVED_ROUTES_PER_MAP) return null;
    const timestamp = Date.now();
    const route: SavedMapRoute = {
      id: `route-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      mapId,
      points: points.slice(0, MAX_ROUTE_WAYPOINTS).map((point, index) => ({
        id: `waypoint-${timestamp}-${index}`,
        x: Math.round(point.x),
        y: Math.round(point.y),
        ...(point.label ? { label: point.label.slice(0, 200) } : {}),
      })),
      updatedAt: new Date(timestamp).toISOString(),
    };
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify([...current, route]));
    notifyChange();
    return route;
  }, []);

  const removeRoute = useCallback((routeId: string) => {
    const current = readJson<SavedMapRoute[]>(ROUTES_STORAGE_KEY, []);
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(current.filter((route) => route.id !== routeId)));
    notifyChange();
  }, []);

  const renameRoute = useCallback((routeId: string, name: string) => {
    const trimmedName = name.trim().slice(0, MAX_ROUTE_NAME_LENGTH);
    if (!trimmedName) return;
    const current = readJson<SavedMapRoute[]>(ROUTES_STORAGE_KEY, []);
    const next = current.map((route) => route.id === routeId
      ? { ...route, name: trimmedName, updatedAt: new Date().toISOString() }
      : route);
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const clearLootRoute = useCallback((lootRunId: string) => {
    const current = readJson<SavedMapRoute[]>(ROUTES_STORAGE_KEY, []);
    localStorage.setItem(
      ROUTES_STORAGE_KEY,
      JSON.stringify(current.filter((route) => route.lootRunId !== lootRunId)),
    );
    notifyChange();
  }, []);

  const replaceRoute = useCallback((
    mapId: string,
    points: Array<MapCoordinate & { label?: string }>,
    name: string,
    lootRunId: string,
  ) => {
    const current = readJson<SavedMapRoute[]>(ROUTES_STORAGE_KEY, []);
    const now = new Date().toISOString();
    const existingRoute = current.find((candidate) => (
      candidate.lootRunId === lootRunId
    ));
    const route: SavedMapRoute = {
      id: existingRoute?.id ?? `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mapId,
      name: name.trim().slice(0, MAX_ROUTE_NAME_LENGTH),
      points: points.slice(0, MAX_ROUTE_WAYPOINTS).map((point, index) => ({
        id: `waypoint-${Date.now()}-${index}`,
        x: Math.round(point.x),
        y: Math.round(point.y),
        ...(point.label ? { label: point.label.slice(0, 200) } : {}),
      })),
      source: "loot-run",
      lootRunId,
      updatedAt: now,
    };
    const next = [
      ...current.filter((candidate) => candidate.id !== existingRoute?.id),
      ...(route.points.length > 0 ? [route] : []),
    ];
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
    return route;
  }, []);

  const startLootRun = useCallback((
    mapId: string,
    items: SavedLootRunItem[],
    locationIds: string[],
    existingRunId?: string,
  ) => {
    const current = readJson<SavedLootRun[]>(LOOT_RUNS_STORAGE_KEY, []);
    const now = new Date().toISOString();
    const existing = current.find((run) => run.id === existingRunId);
    const normalizedItems = items
      .filter((item, index) => items.findIndex(({ id }) => id === item.id) === index)
      .slice(0, MAX_STORED_LOOT_RUN_ITEMS)
      .map((item) => ({ id: item.id.slice(0, 180), name: item.name.slice(0, 200) }));
    if (normalizedItems.length === 0) return null;
    const normalizedLocationIds = [...new Set(locationIds)].slice(0, MAX_ROUTE_WAYPOINTS);
    const run: SavedLootRun = {
      id: existing?.id ?? `loot-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mapId,
      itemId: normalizedItems[0]!.id,
      itemName: normalizedItems[0]!.name,
      items: normalizedItems,
      locationIds: normalizedLocationIds,
      completedLocationIds: existing?.completedLocationIds.filter((id) => normalizedLocationIds.includes(id)) ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = [...current.filter((candidate) => candidate.id !== run.id), run];
    localStorage.setItem(LOOT_RUNS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
    return run;
  }, []);

  const toggleLootRunLocation = useCallback((runId: string, locationId: string) => {
    const current = readJson<SavedLootRun[]>(LOOT_RUNS_STORAGE_KEY, []);
    const next = current.map((run) => {
      if (run.id !== runId || !run.locationIds.includes(locationId)) return run;
      const completedLocationIds = run.completedLocationIds.includes(locationId)
        ? run.completedLocationIds.filter((id) => id !== locationId)
        : [...run.completedLocationIds, locationId];
      return { ...run, completedLocationIds, updatedAt: new Date().toISOString() };
    });
    localStorage.setItem(LOOT_RUNS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const clearLootRun = useCallback((runId: string) => {
    const current = readJson<SavedLootRun[]>(LOOT_RUNS_STORAGE_KEY, []);
    localStorage.setItem(
      LOOT_RUNS_STORAGE_KEY,
      JSON.stringify(current.filter((run) => run.id !== runId)),
    );
    notifyChange();
  }, []);

  return {
    favoriteIds,
    markers,
    notes,
    routes,
    lootRuns,
    lootedLocationIds,
    toggleFavorite,
    toggleLooted,
    saveMarker,
    renameMarker,
    updateMarkerStyle,
    updateMarkerGroup,
    removeMarker,
    saveNote,
    saveRoute,
    renameRoute,
    removeRoute,
    clearLootRoute,
    replaceRoute,
    startLootRun,
    toggleLootRunLocation,
    clearLootRun,
  };
};
