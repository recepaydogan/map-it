import {
  BRIDGE_MOD_ID,
  isModEnabled,
  withModEnabled,
} from "./bridge-mod-activation";
import {
  publishBridgeModInstallStatus,
  readBridgeModInstallStatus,
  resolveSuccessfulBridgeModInstallState,
} from "./bridge-mod-install-store";
import { getRuntimeZomboidRootCandidates, joinPath } from "./live-bridge-paths";

const UTF8_ENCODING = "UTF8" as overwolf.io.enums.eEncoding;
const BRIDGE_DIRECTORY = "ProjectZomboidInteractiveMap";
const BRIDGE_FILES = [
  "42/mod.info",
  "common/media/lua/client/PZInteractiveMapBridge.lua",
] as const;

const PROJECT_ZOMBOID_GAME_ID = 10598;
const PROJECT_ZOMBOID_TITLE = /project zomboid/i;

/** Upper bound on the save folders whose mod list we touch. A long-running
 *  player can have dozens; reading every one of them on each install pass is
 *  disk work with no payoff, and nobody is continuing their 90th save. */
const MOD_LIST_LIMIT = 60;

const directoryExists = (path: string) => new Promise<boolean>((resolve) => {
  overwolf.io.dir(path, (result) => resolve(result.success));
});

const listSubdirectories = (path: string) => new Promise<string[]>((resolve) => {
  overwolf.io.dir(path, (result) => {
    resolve(
      result.success && Array.isArray(result.data)
        ? result.data.filter((entry) => entry.type === "dir").map((entry) => entry.name)
        : [],
    );
  });
});

const readTextFile = (path: string) => new Promise<string | null>((resolve) => {
  overwolf.io.readFileContents(path, UTF8_ENCODING, (result) => {
    resolve(result.success && typeof result.content === "string" ? result.content : null);
  });
});

const writeTextFile = (path: string, content: string) => new Promise<void>((resolve, reject) => {
  overwolf.io.writeFileContents(path, content, UTF8_ENCODING, false, (result) => {
    if (result.success) resolve();
    else reject(new Error(result.error || `Could not write ${path}.`));
  });
});

const readBundledFile = async (relativePath: string) => {
  const url = new URL(`bridge-mod/${BRIDGE_DIRECTORY}/${relativePath}`, window.location.href);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Bundled Bridge file is unavailable (${response.status}): ${relativePath}`);
  return response.text();
};

/**
 * The `…\Zomboid` folder is created by the GAME on its first run, so a player
 * who installs this app before ever launching Project Zomboid has nowhere to
 * install into. That is not a broken install — it is an install waiting for the
 * game, and it heals itself on the next session pass (see
 * bridge-mod-install-runner), so it gets its own status and its own notice.
 */
export class ZomboidUserFolderMissingError extends Error {
  constructor() {
    super("The Project Zomboid user folder could not be found.");
    this.name = "ZomboidUserFolderMissingError";
  }
}

const findZomboidRoot = async () => {
  const candidates = getRuntimeZomboidRootCandidates(overwolf.io.paths);
  if (candidates.length === 0) throw new Error("The Windows user profile path is unavailable.");
  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }
  throw new ZomboidUserFolderMissingError();
};

const isProjectZomboidRunning = () => new Promise<boolean>((resolve) => {
  const probe = overwolf.games?.getRunningGameInfo;
  if (!probe) {
    resolve(false);
    return;
  }
  probe((info) => resolve(Boolean(
    info?.isRunning
    && (Number(info.classId) === PROJECT_ZOMBOID_GAME_ID
      || PROJECT_ZOMBOID_TITLE.test(info.title ?? "")),
  )));
});

const getDefaultModListPath = (zomboidRoot: string) => joinPath(zomboidRoot, "mods\\default.txt");

/**
 * Every mod list worth ticking the Bridge into: the main-menu list first, then
 * one per existing save so games already in progress pick it up too.
 */
const collectModListPaths = async (zomboidRoot: string) => {
  const paths = [getDefaultModListPath(zomboidRoot)];
  const savesRoot = joinPath(zomboidRoot, "Saves");

  for (const gameMode of await listSubdirectories(savesRoot)) {
    for (const save of await listSubdirectories(joinPath(savesRoot, gameMode))) {
      paths.push(joinPath(savesRoot, `${gameMode}\\${save}\\mods.txt`));
      if (paths.length >= MOD_LIST_LIMIT) return paths;
    }
  }

  return paths;
};

/**
 * Adds the Bridge to the player's mod lists and reports how many files changed.
 *
 * `default.txt` is authoritative for the next game launch, so failing to
 * update it is a real installation error. Existing-save lists remain
 * best-effort: one inaccessible old save must not block every player, and a
 * save without a `mods.txt` is not ours to invent.
 */
const activateBridgeInModLists = async (zomboidRoot: string) => {
  const defaultModListPath = getDefaultModListPath(zomboidRoot);
  let activated = 0;

  for (const path of await collectModListPaths(zomboidRoot)) {
    const current = await readTextFile(path);
    if (current === null && path !== defaultModListPath) continue;

    const next = withModEnabled(current, BRIDGE_MOD_ID);
    if (next === current || isModEnabled(current, BRIDGE_MOD_ID)) continue;
    if (next === null) {
      const error = new Error(`Could not update the Bridge activation list: ${path}.`);
      if (path === defaultModListPath) throw error;
      console.warn(error.message);
      continue;
    }

    try {
      await writeTextFile(path, next);
      activated += 1;
    } catch (error) {
      if (path === defaultModListPath) throw error;
      console.warn(`[LiveBridge] Could not activate the Bridge in ${path}.`, error);
    }
  }

  return activated;
};

/**
 * @param preserveStatusOnFailure keep an existing "installed" status instead of
 *   replacing it with "failed". Used by the retries that run while a game
 *   session is live: those re-read a folder the game itself is writing to, so a
 *   transient miss must not flip a working install into the failure notice.
 */
const performBridgeModInstallation = async (preserveStatusOnFailure = false) => {
  if (typeof overwolf === "undefined" || !overwolf.io) return null;

  try {
    const previousStatus = readBridgeModInstallStatus();
    const zomboidRoot = await findZomboidRoot();
    const targetRoot = joinPath(zomboidRoot, `mods\\${BRIDGE_DIRECTORY}`);
    let filesChanged = false;

    for (const relativePath of BRIDGE_FILES) {
      const content = await readBundledFile(relativePath);
      const targetPath = joinPath(targetRoot, relativePath.replaceAll("/", "\\"));
      if (await readTextFile(targetPath) === content) continue;
      await writeTextFile(targetPath, content);
      filesChanged = true;
    }

    // The game owns these files while it runs — it rewrites the mod lists when
    // the player leaves the mod menu and when a save is written, so an edit made
    // mid-session can be thrown away without warning. Activation waits for the
    // pass that runs once the game exits (see bridge-mod-install-runner).
    const gameRunning = await isProjectZomboidRunning();
    const activated = gameRunning ? 0 : await activateBridgeInModLists(zomboidRoot);

    const defaultModList = await readTextFile(getDefaultModListPath(zomboidRoot));
    const bridgeActive = isModEnabled(defaultModList, BRIDGE_MOD_ID);
    const status = {
      state: resolveSuccessfulBridgeModInstallState({
        previousState: previousStatus?.state,
        gameRunning,
        filesChanged,
        bridgeActive,
      }),
      targetPath: targetRoot,
      bridgeActive,
      autoActivated: activated > 0,
      updatedAt: Date.now(),
    };
    publishBridgeModInstallStatus(status);
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Bridge mod could not be installed.";
    const previousState = readBridgeModInstallStatus()?.state;
    const keepInstalled = preserveStatusOnFailure
      && (previousState === "installed" || previousState === "restart_required");
    if (!keepInstalled) {
      publishBridgeModInstallStatus({
        state: error instanceof ZomboidUserFolderMissingError ? "awaiting_game" : "failed",
        error: message,
        updatedAt: Date.now(),
      });
    }
    throw error;
  }
};

let installationPromise: ReturnType<typeof performBridgeModInstallation> | null = null;

export const installBundledBridgeMod = () => {
  installationPromise ??= performBridgeModInstallation();
  return installationPromise;
};

export const retryBundledBridgeModInstallation = (preserveStatusOnFailure = false) => {
  installationPromise = performBridgeModInstallation(preserveStatusOnFailure);
  return installationPromise;
};
