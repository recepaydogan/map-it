import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  migrateSavedMapStorage,
  NOTES_STORAGE_KEY,
  SAVED_MAP_CHANGE_EVENT,
} from "./saved-map-storage";
import type {
  MapCoordinate,
  UserMapMarker,
  UserMarkerGroup,
  UserMarkerStyleChange,
} from "./types";

const SAVED_STATE_STORAGE_KEYS = new Set<string>([
  FAVORITES_STORAGE_KEY,
  COMPLETED_LOCATIONS_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
]);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const notifyChange = () => window.dispatchEvent(new Event(SAVED_MAP_CHANGE_EVENT));

/**
 * Everything the player saves on the map — favourites, completed places,
 * personal markers and notes. localStorage is the source of truth and every
 * mutation writes there first, so the desktop window and the in-game overlay
 * always agree (the `storage` event refreshes the other window).
 */
export const useSavedMapState = () => {
  migrateSavedMapStorage();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readJson(FAVORITES_STORAGE_KEY, []));
  const [markers, setMarkers] = useState<UserMapMarker[]>(() => readJson(MARKERS_STORAGE_KEY, []));
  const [notes, setNotes] = useState<Record<string, string>>(() => readJson(NOTES_STORAGE_KEY, {}));
  const [completedIds, setCompletedIds] = useState<string[]>(
    () => readJson(COMPLETED_LOCATIONS_STORAGE_KEY, []),
  );

  const refresh = useCallback(() => {
    setFavoriteIds(readJson(FAVORITES_STORAGE_KEY, []));
    setMarkers(readJson(MARKERS_STORAGE_KEY, []));
    setNotes(readJson(NOTES_STORAGE_KEY, {}));
    setCompletedIds(readJson(COMPLETED_LOCATIONS_STORAGE_KEY, []));
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && !SAVED_STATE_STORAGE_KEYS.has(event.key)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SAVED_MAP_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAVED_MAP_CHANGE_EVENT, refresh);
    };
  }, [refresh]);

  const toggleFavorite = useCallback((id: string) => {
    const current = readJson<string[]>(FAVORITES_STORAGE_KEY, []);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const toggleCompleted = useCallback((id: string) => {
    const current = readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

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
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify([...current, marker]));
    notifyChange();
    return marker;
  }, []);

  const updateMarker = (id: string, patch: Partial<UserMapMarker>) => {
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const next = current.map((marker) => marker.id === id ? { ...marker, ...patch } : marker);
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(next));
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
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(current.filter((marker) => marker.id !== id)));
    const nextNotes = { ...readJson<Record<string, string>>(NOTES_STORAGE_KEY, {}) };
    delete nextNotes[id];
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes));
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(FAVORITES_STORAGE_KEY, []).filter((favoriteId) => favoriteId !== id)),
    );
    localStorage.setItem(
      COMPLETED_LOCATIONS_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []).filter((locationId) => locationId !== id)),
    );
    notifyChange();
  }, []);

  const saveNote = useCallback((id: string, note: string) => {
    const current = readJson<Record<string, string>>(NOTES_STORAGE_KEY, {});
    const next = { ...current };
    if (note.trim()) next[id] = note.slice(0, 10_000);
    else delete next[id];
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

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
