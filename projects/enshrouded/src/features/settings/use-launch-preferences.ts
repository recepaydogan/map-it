import { useSyncExternalStore } from "react";
import {
  getLaunchPreferences,
  subscribeLaunchPreferences,
  updateLaunchPreferences,
  type LaunchPreferences,
} from "./launch-preferences";

/**
 * The user's launch-behaviour preferences, shared across windows. The Settings
 * page writes them; the background controller reads them to decide what to
 * surface when the game starts. `update` takes a partial patch.
 */
export const useLaunchPreferences = (): {
  preferences: LaunchPreferences;
  update: (patch: Partial<LaunchPreferences>) => void;
} => {
  const preferences = useSyncExternalStore(
    subscribeLaunchPreferences,
    getLaunchPreferences,
    getLaunchPreferences,
  );
  return { preferences, update: updateLaunchPreferences };
};
