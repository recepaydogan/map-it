import { useSyncExternalStore } from "react";
import { getMapDefinition, MAP_DEFINITIONS, type SelectedMapDefinition } from "./map-registry";

/**
 * Which registered map is showing. Shared by every window through
 * localStorage (the `storage` event carries a change made in the desktop
 * window to the in-game overlay), same pattern as the launch preferences.
 */
const STORAGE_KEY = "gm:selected-map";

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: SelectedMapDefinition | null = null;

const read = (): SelectedMapDefinition => {
  try {
    return getMapDefinition(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return MAP_DEFINITIONS[0]!;
  }
};

const invalidate = () => {
  snapshot = null;
  for (const listener of listeners) listener();
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSelectedMap = (): SelectedMapDefinition => {
  if (!snapshot) snapshot = read();
  return snapshot;
};

export const selectMap = (id: string): void => {
  const definition = getMapDefinition(id);
  try {
    window.localStorage.setItem(STORAGE_KEY, definition.id);
  } catch {
    // Non-fatal — the choice simply won't survive a relaunch.
  }
  snapshot = definition;
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) invalidate();
  });
}

export const useSelectedMap = (): { definition: SelectedMapDefinition; select: (id: string) => void } => {
  const definition = useSyncExternalStore(subscribe, getSelectedMap, getSelectedMap);
  return { definition, select: selectMap };
};
