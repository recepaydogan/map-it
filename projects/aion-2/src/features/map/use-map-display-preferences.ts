import { useSyncExternalStore } from "react";
import {
  getMapDisplayPreferences,
  subscribeMapDisplayPreferences,
  updateMapDisplayPreferences,
  type MapDisplayPreferences,
} from "./map-display-preferences";

/**
 * The map's display preferences, shared across windows. Settings writes them;
 * the map layers read them. `update` takes a partial patch.
 */
export const useMapDisplayPreferences = (): {
  preferences: MapDisplayPreferences;
  update: (patch: Partial<MapDisplayPreferences>) => void;
} => {
  const preferences = useSyncExternalStore(
    subscribeMapDisplayPreferences,
    getMapDisplayPreferences,
    getMapDisplayPreferences,
  );
  return { preferences, update: updateMapDisplayPreferences };
};
