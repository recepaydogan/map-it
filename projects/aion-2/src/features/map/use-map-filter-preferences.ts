import { useSyncExternalStore } from "react";
import { getMapFilterPreferences, subscribeMapFilterPreferences } from "./map-filter-preferences";

export const useMapFilterPreferences = (mapId: string) => useSyncExternalStore(
  subscribeMapFilterPreferences,
  () => getMapFilterPreferences(mapId),
  () => getMapFilterPreferences(mapId),
);
