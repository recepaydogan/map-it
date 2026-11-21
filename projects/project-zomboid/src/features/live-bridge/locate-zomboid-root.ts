/**
 * The manual "find my Zomboid folder" flow, shared by every surface that offers
 * it (the map-library banner and the install-failed modal). Picker → validate →
 * persist → immediately retry the Bridge mod install, so a successful selection
 * repairs live tracking in the same gesture.
 */
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  joinLocalPath,
  openLocalFolderPicker,
  readLocalDirectory,
} from "../../overwolf-utils/file-system";
import { IS_OVERWOLF } from "../../utils/platform";
import { retryBundledBridgeModInstallation } from "./bridge-mod-installer";
import {
  readConfiguredZomboidRoot,
  saveConfiguredZomboidRoot,
} from "./live-bridge-paths";

export type LocateZomboidRootSource = "library_banner" | "install_modal";

export type LocateZomboidRootResult =
  | "selected"
  | "invalid"
  | "cancelled"
  | "unavailable";

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

/** The selection counts as a Zomboid root when it — or a `Zomboid` child, for
 *  players who pick the parent — contains the game-created `mods` folder. */
const findSelectedZomboidRoot = async (selectedPath: string) => {
  const candidates = [
    { path: selectedPath, resolution: "selected_folder" as const },
    { path: joinLocalPath(selectedPath, "Zomboid"), resolution: "child_zomboid_folder" as const },
  ];
  for (const candidate of candidates) {
    const entries = await readLocalDirectory(candidate.path);
    if (entries?.some(({ name, type }) => type === "dir" && normalize(name) === "mods")) {
      return { root: candidate.path, resolution: candidate.resolution };
    }
  }
  return null;
};

export const locateZomboidRoot = async (
  source: LocateZomboidRootSource,
): Promise<LocateZomboidRootResult> => {
  track(EVENTS.ZOMBOID_FOLDER_PICKER_OPENED, { source });
  if (!IS_OVERWOLF || !overwolf.utils?.openFolderPicker) {
    track(EVENTS.ZOMBOID_FOLDER_PICKER_COMPLETED, { result: "unavailable", source });
    return "unavailable";
  }
  const initialPath = readConfiguredZomboidRoot()
    ?? overwolf.io.paths.documents
    ?? "";
  const selectedPath = await openLocalFolderPicker(initialPath);
  if (!selectedPath) {
    track(EVENTS.ZOMBOID_FOLDER_PICKER_COMPLETED, { result: "cancelled", source });
    return "cancelled";
  }
  const selection = await findSelectedZomboidRoot(selectedPath);
  if (!selection) {
    track(EVENTS.ZOMBOID_FOLDER_PICKER_COMPLETED, { result: "invalid", source });
    return "invalid";
  }

  saveConfiguredZomboidRoot(selection.root);
  track(EVENTS.ZOMBOID_FOLDER_PICKER_COMPLETED, {
    result: "selected",
    resolution: selection.resolution,
    source,
  });
  await retryBundledBridgeModInstallation().catch(() => undefined);
  return "selected";
};
