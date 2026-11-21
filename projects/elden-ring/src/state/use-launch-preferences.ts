import { useSyncExternalStore } from "react";
import {
  getLaunchPreferences,
  subscribeLaunchPreferences,
  updateLaunchPreferences,
  type LaunchPreferences,
} from "../services/system/launch-preferences";

/**
 * The user's launch-behaviour preferences, shared across windows. The Settings
 * page writes them; the background controller reads them to decide whether to
 * auto-open the desktop window around the game. `update` takes a partial patch.
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
