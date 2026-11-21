import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { notifySavedDataChange, SAVED_DATA_REFRESH_EVENT } from "../../services/saved-data/saved-data-events";
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
  UserMarkerEdits,
  UserMarkerGroup,
  UserMarkerIcon,
} from "./types";

const CHANGE_EVENT = "gm:saved-state-changed";
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

const notifyChange = () => {
  window.dispatchEvent(new Event(CHANGE_EVENT));
  notifySavedDataChange();
};

/**
 * Everything the player saves on the map — favourites, completed places,
 * personal markers. localStorage is the source of truth and every
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
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener(SAVED_DATA_REFRESH_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener(SAVED_DATA_REFRESH_EVENT, refresh);
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

  const setCompletedGroup = useCallback((ids: string[], completed: boolean) => {
    const current = readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []);
    const group = new Set(ids);
    const next = completed ? [...new Set([...current, ...ids])]
      : current.filter((id) => !group.has(id));
    localStorage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(next));
    notifyChange();
  }, []);

  const addMarker = useCallback((
    coordinate: MapCoordinate,
    name: string,
    label: string,
    region: string,
    mapId: string,
    options: { icon?: UserMarkerIcon; group?: UserMarkerGroup; note?: string } = {},
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("A personal marker needs a name.");
    const current = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    const marker: UserMapMarker = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName.slice(0, 200),
      category: "custom",
      label,
      subtype: "custom",
      regionId: "personal",
      region,
      x: Math.round(coordinate.x),
      y: Math.round(coordinate.y),
      icon: options.icon ?? "pin",
      group: options.group ?? DEFAULT_MARKER_GROUP,
      mapId,
    };
    const note = options.note?.trim().slice(0, 10_000);
    if (note) {
      const currentNotes = readJson<Record<string, string>>(NOTES_STORAGE_KEY, {});
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ ...currentNotes, [marker.id]: note }));
    }
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify([...current, marker]));
    notifyChange();
    return marker;
  }, []);

  const saveMarkerEdits = useCallback((id: string, edits: UserMarkerEdits) => {
    const name = edits.name.trim().slice(0, 200);
    if (!name) throw new Error("A personal marker needs a name.");
    const currentMarkers = readJson<UserMapMarker[]>(MARKERS_STORAGE_KEY, []);
    if (!currentMarkers.some((marker) => marker.id === id)) throw new Error("Personal marker was not found.");
    const markers = currentMarkers.map((marker) => marker.id === id
      ? { ...marker, name, icon: edits.icon, group: edits.group }
      : marker);
    const notes = { ...readJson<Record<string, string>>(NOTES_STORAGE_KEY, {}) };
    const note = edits.note.trim().slice(0, 10_000);
    if (note) notes[id] = note;
    else delete notes[id];
    localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
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
      COMPLETED_LOCATIONS_STORAGE_KEY,
      JSON.stringify(readJson<string[]>(COMPLETED_LOCATIONS_STORAGE_KEY, []).filter((locationId) => locationId !== id)),
    );
    notifyChange();
  }, []);

  return {
    favoriteIds,
    markers,
    notes,
    completedIds,
    toggleFavorite,
    toggleCompleted,
    setCompletedGroup,
    addMarker,
    saveMarkerEdits,
    removeMarker,
  };
};
