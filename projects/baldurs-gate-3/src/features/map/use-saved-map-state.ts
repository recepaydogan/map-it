import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { getSavedMapStorage, notifySavedMapChange, SAVED_MAP_CHANGE_EVENT, SAVED_MAP_ACCOUNT_PREFIX, SAVED_MAP_OWNER_KEY } from "./saved-map-account-storage";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  migrateSavedMapStorage,
  NOTES_STORAGE_KEY,
} from "./saved-map-storage";
import type {
  MapCoordinate,
  UserMapMarker,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

const CHANGE_EVENT = SAVED_MAP_CHANGE_EVENT;
const SAVED_STATE_STORAGE_KEYS = new Set<string>([
  FAVORITES_STORAGE_KEY,
  COMPLETED_LOCATIONS_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
]);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = getSavedMapStorage().getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const notifyChange = notifySavedMapChange;

/**
 * Everything the player saves on the map — favourites, completed places,
 * personal markers and notes. Every mutation writes to the active account's
 * local cache first; cloud sync merges it independently. The `storage` event
 * refreshes the other window, including after account switches.
 */
export const useSavedMapState = (aliases: Readonly<Record<string, string>>) => {
  migrateSavedMapStorage(getSavedMapStorage(), aliases);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readJson(FAVORITES_STORAGE_KEY, []));
  const [markers, setMarkers] = useState<UserMapMarker[]>(() => readJson(MARKERS_STORAGE_KEY, []));
  const [notes, setNotes] = useState<Record<string, string>>(() => readJson(NOTES_STORAGE_KEY, {}));
  const [completedIds, setCompletedIds] = useState<string[]>(
    () => readJson(COMPLETED_LOCATIONS_STORAGE_KEY, []),
  );

  const refresh = useCallback(() => {
    migrateSavedMapStorage(getSavedMapStorage(), aliases);
    setFavoriteIds(readJson(FAVORITES_STORAGE_KEY, []));
    setMarkers(readJson(MARKERS_STORAGE_KEY, []));
    setNotes(readJson(NOTES_STORAGE_KEY, {}));
    setCompletedIds(readJson(COMPLETED_LOCATIONS_STORAGE_KEY, []));
  }, [aliases]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SAVED_MAP_OWNER_KEY && !event.key.startsWith(SAVED_MAP_ACCOUNT_PREFIX) && !SAVED_STATE_STORAGE_KEYS.has(event.key)) return;
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
    migrateSavedMapStorage(getSavedMapStorage(), aliases);
    const locationId = aliases[id] ?? id;
    const current = readJson<string[]>(FAVORITES_STORAGE_KEY, []);
    const next = current.includes(locationId) ? current.filter((item) => item !== locationId) : [...current, locationId];
    getSavedMapStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    track(EVENTS.MAP_SAVE_CHANGED, { kind: "favorite", action: next.includes(locationId) ? "added" : "removed", total_count: next.length });
    notifyChange();
  }, [aliases]);

  const toggleCompleted = useCallback((id: string) => {
    migrateSavedMapStorage(getSavedMapStorage(), aliases);
    const locationId = aliases[id] ?? id;
    const current = readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []);
    const next = current.includes(locationId) ? current.filter((item) => item !== locationId) : [...current, locationId];
    getSavedMapStorage().setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(next));
    track(EVENTS.MAP_SAVE_CHANGED, { kind: "completed", action: next.includes(locationId) ? "added" : "removed", total_count: next.length });
    notifyChange();
  }, [aliases]);

  const addMarker = useCallback((
    coordinate: MapCoordinate,
    name: string,
    label: string,
    region: string,
    mapId: string,
  ) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const marker: UserMapMarker = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: "custom",
      label,
      subtype: "custom",
      regionId: "personal",
      region,
      x: Math.round(coordinate.x),
      y: Math.round(coordinate.y),
      color: "sage",
      icon: "pin",
      group: DEFAULT_MARKER_GROUP,
      mapId,
    };
    getSavedMapStorage().setItem(MARKERS_STORAGE_KEY, JSON.stringify([...current, marker]));
    notifyChange();
    return marker;
  }, []);

  const updateMarker = (id: string, patch: Partial<UserMapMarker>) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const next = current.map((marker) => marker.id === id ? { ...marker, ...patch } : marker);
    getSavedMapStorage().setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  };

  const renameMarker = useCallback((id: string, name: string) => {
    updateMarker(id, { name: name.trim().slice(0, 200) });
  }, []);

  const updateMarkerStyle = useCallback((id: string, change: UserMarkerStyleChange) => {
    updateMarker(id, change);
  }, []);

  const updateMarkerGroup = useCallback((id: string, group: UserMarkerGroup) => {
    updateMarker(id, { group });
  }, []);

  const removeMarker = useCallback((id: string) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    getSavedMapStorage().setItem(MARKERS_STORAGE_KEY, JSON.stringify(current.filter((marker) => marker.id !== id)));
    const nextNotes = { ...readJson<Record<string, string>>(NOTES_STORAGE_KEY, {}) };
    delete nextNotes[id];
    getSavedMapStorage().setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes));
    getSavedMapStorage().setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(FAVORITES_STORAGE_KEY, []).filter((favoriteId) => favoriteId !== id)),
    );
    getSavedMapStorage().setItem(
      COMPLETED_LOCATIONS_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []).filter((locationId) => locationId !== id)),
    );
    notifyChange();
  }, []);

  const saveNote = useCallback((id: string, note: string) => {
    migrateSavedMapStorage(getSavedMapStorage(), aliases);
    const locationId = aliases[id] ?? id;
    const current = readJson<Record<string, string>>(NOTES_STORAGE_KEY, {});
    const next = { ...current };
    if (note.trim()) next[locationId] = note.slice(0, 10_000);
    else delete next[locationId];
    if (current[locationId] === next[locationId]) return;
    getSavedMapStorage().setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
    track(EVENTS.MAP_SAVE_CHANGED, {
      kind: "note",
      action: !next[locationId] ? "removed" : current[locationId] ? "updated" : "added",
      total_count: Object.keys(next).length,
    });
    notifyChange();
  }, [aliases]);

  return {
    favoriteIds,
    markers,
    notes,
    completedIds,
    toggleFavorite,
    toggleCompleted,
    addMarker,
    renameMarker,
    updateMarkerStyle,
    updateMarkerGroup,
    removeMarker,
    saveNote,
  };
};
