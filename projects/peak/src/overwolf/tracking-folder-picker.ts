import { track } from "../utils/analytics/analytics";
import { EVENTS } from "../utils/analytics/events";
import { installPathAnalyticsProperties } from "../utils/analytics/install-path";
import { IS_OVERWOLF } from "../utils/platform";
import {
  ensureTrackingBridge,
  findSelectedPeakDirectory,
  getCachedPeakDirectory,
  saveSelectedPeakDirectory,
} from "./tracking-installer";

const DEFAULT_PICKER_DIRECTORY = "C:\\Program Files (x86)\\Steam\\steamapps\\common";

export type TrackingFolderPickerResult =
  | "selected"
  | "cancelled"
  | "invalid"
  | "unavailable";

const openFolderPicker = (initialPath: string): Promise<string | null> => {
  if (!IS_OVERWOLF || !overwolf.utils?.openFolderPicker) return Promise.resolve(null);
  return new Promise((resolve) => {
    overwolf.utils.openFolderPicker(initialPath, (result) => {
      resolve(result.success && result.path ? result.path : null);
    });
  });
};

/** Opens Overwolf's native picker and installs tracking from a valid PEAK folder. */
export const pickPeakTrackingDirectory = async (): Promise<TrackingFolderPickerResult> => {
  if (!IS_OVERWOLF || !overwolf.utils?.openFolderPicker) return "unavailable";

  track(EVENTS.TRACKER_FOLDER_PICKER_OPENED);
  const selectedPath = await openFolderPicker(
    getCachedPeakDirectory() ?? DEFAULT_PICKER_DIRECTORY,
  );
  if (!selectedPath) {
    track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: "cancelled" });
    return "cancelled";
  }

  const directory = await findSelectedPeakDirectory(selectedPath);
  if (!directory) {
    track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: "invalid" });
    return "invalid";
  }

  saveSelectedPeakDirectory(directory);
  track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: "selected" });
  track(
    EVENTS.TRACKER_FOLDER_MANUALLY_SELECTED,
    installPathAnalyticsProperties(directory),
  );
  await ensureTrackingBridge(true);
  return "selected";
};
