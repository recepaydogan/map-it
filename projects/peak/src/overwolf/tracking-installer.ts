import { APP_CONFIG } from "../config/app-config";
import { updatePeakSession } from "../state/peak-session-store";
import { track } from "../utils/analytics/analytics";
import { EVENTS } from "../utils/analytics/events";
import { installPathAnalyticsProperties } from "../utils/analytics/install-path";

// Silently installs and updates the position-bridge mod inside the PEAK
// directory. The user never interacts with this: the background window runs
// it on startup and whenever the game starts or stops. An existing BepInEx
// installation (for example from a mod manager) is respected — only the
// bridge plugin files are added next to the user's other plugins.

const DEFAULT_GAME_DIRECTORIES = [
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\PEAK",
  "C:\\Program Files\\Steam\\steamapps\\common\\PEAK",
];
const WINDOWS_DRIVES = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode("A".charCodeAt(0) + index),
);
const COMMON_STEAM_ROOTS = WINDOWS_DRIVES.flatMap((drive) => [
  `${drive}:\\SteamLibrary`,
  `${drive}:\\Steam`,
  `${drive}:\\Program Files (x86)\\Steam`,
  `${drive}:\\Program Files\\Steam`,
]);
const GAME_EXECUTABLE = "PEAK.exe";
const PLUGIN_DIRECTORY = "BepInEx\\plugins\\PeakMap";
const PAYLOAD_URL_ROOT = "tracking-mod/payload";
const PLUGIN_PAYLOAD_PREFIX = "BepInEx/plugins/PeakMap/";
const INSTALL_MARKER_NAME = ".peak-map-install";
const RESTART_GAME_KEY = "peak-map:tracker-restart-game";

const fileExists = (path: string): Promise<boolean> =>
  new Promise((resolve) => {
    overwolf.io.fileExists(path, (result) => resolve(Boolean(result.success && result.found)));
  });

const readText = (path: string): Promise<string | null> =>
  new Promise((resolve) => {
    overwolf.io.readFileContents(path, "UTF8" as overwolf.io.enums.eEncoding, (result) => {
      resolve(result.success && typeof result.content === "string" ? result.content : null);
    });
  });

const writeText = (path: string, contents: string): Promise<void> =>
  new Promise((resolve, reject) => {
    overwolf.io.writeFileContents(
      path,
      contents,
      "UTF8" as overwolf.io.enums.eEncoding,
      true,
      (result) => (result.success ? resolve() : reject(new Error(result.error ?? "write-failed"))),
    );
  });

const copyPackageFile = (sourcePath: string, destinationPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    overwolf.io.copyFile(sourcePath, destinationPath, true, false, (result) =>
      result.success ? resolve() : reject(new Error(result.error ?? "copy-failed")),
    );
  });

const normalizeDirectory = (directory: string): string =>
  directory.replaceAll("/", "\\").replace(/\\+$/, "");

const uniqueDirectories = (directories: readonly string[]): string[] => {
  const unique = new Map<string, string>();
  for (const directory of directories) {
    const normalized = normalizeDirectory(directory);
    if (normalized && !unique.has(normalized.toLowerCase())) {
      unique.set(normalized.toLowerCase(), normalized);
    }
  }
  return [...unique.values()];
};

/** Optional Overwolf discovery APIs must never block the filesystem fallback. */
const optionalPaths = (
  request: (done: (paths: string[]) => void) => void,
): Promise<string[]> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve([]), 1_000);
    const done = (paths: string[]) => {
      window.clearTimeout(timer);
      resolve(paths);
    };
    try {
      request(done);
    } catch {
      done([]);
    }
  });

const steamRootFromPath = (value: string | undefined): string[] => {
  if (!value) return [];
  const normalized = normalizeDirectory(value);
  const match = normalized.match(
    /^([a-z]:\\.+)\\(?:steam\.exe|steamapps\\common\\PEAK\\PEAK\.exe)$/i,
  );
  return match?.[1] ? [match[1]] : [];
};

/** Supports both current `path` entries and Steam's legacy numbered entries. */
export const parseSteamLibraryFolders = (contents: string): string[] => {
  const paths: string[] = [];
  const entry = /"(?:path|\d+)"\s+"([a-z]:[\\/][^"]+)"/gi;
  for (const match of contents.matchAll(entry)) {
    if (match[1]) paths.push(match[1].replace(/\\\\/g, "\\"));
  }
  return uniqueDirectories(paths);
};

const discoverSteamRoots = async (): Promise<string[]> => {
  const defaults = [overwolf.io.paths.programFilesX86, overwolf.io.paths.programFiles]
    .filter((path): path is string => Boolean(path))
    .map((path) => `${path}\\Steam`);
  const detected = await Promise.all([
    optionalPaths((done) => {
      if (!overwolf.games?.launchers?.getRunningLaunchersInfo) return done([]);
      overwolf.games.launchers.getRunningLaunchersInfo((result) =>
        done(
          result.success
            ? (result.launchers ?? []).flatMap((launcher) =>
                /[\\/]steam\.exe$/i.test(launcher.path ?? "")
                  ? steamRootFromPath(launcher.path)
                  : [],
              )
            : [],
        ),
      );
    }),
    optionalPaths((done) => {
      if (!overwolf.games?.getGameInfo || APP_CONFIG.supportedGameId === null) return done([]);
      overwolf.games.getGameInfo(APP_CONFIG.supportedGameId, (result) =>
        done(
          result.success
            ? [
                ...steamRootFromPath(result.gameInfo?.LauncherPath),
                ...steamRootFromPath(result.gameInfo?.ProcessPath),
              ]
            : [],
        ),
      );
    }),
  ]);
  return uniqueDirectories([...defaults, ...detected.flat()]);
};

const discoverAdditionalSteamDirectories = async (): Promise<string[]> => {
  const detectedRoots = await discoverSteamRoots();
  const registries = await Promise.all(
    detectedRoots.map((root) => readText(`${root}\\steamapps\\libraryfolders.vdf`)),
  );
  const registeredRoots = registries.flatMap((contents) =>
    contents ? parseSteamLibraryFolders(contents) : [],
  );
  return uniqueDirectories([
    ...registeredRoots,
    ...detectedRoots,
    ...COMMON_STEAM_ROOTS,
  ]).map((root) => `${root}\\steamapps\\common\\PEAK`);
};

const isPeakGame = (info: overwolf.games.GetRunningGameInfoResult | null): boolean => {
  if (!info?.isRunning || APP_CONFIG.supportedGameId === null) return false;
  const gameId = info.classId || Math.floor((info.id ?? 0) / 10);
  return gameId === APP_CONFIG.supportedGameId
    && /(?:^|[\\/])PEAK\.exe$/i.test(info.executionPath ?? "");
};

const runningPeakGame = (): Promise<overwolf.games.GetRunningGameInfoResult | null> =>
  new Promise((resolve) => {
    overwolf.games.getRunningGameInfo((info) => resolve(isPeakGame(info) ? info : null));
  });

const runningGameDirectory = async (): Promise<string | null> => {
  const game = await runningPeakGame();
  if (!game) return null;
  const normalized = game.executionPath.replaceAll("/", "\\");
  const separatorIndex = normalized.lastIndexOf("\\");
  return separatorIndex > 0 ? normalized.slice(0, separatorIndex) : null;
};

// Resolved once per app session and shared with the live-state reader.
let cachedDirectory: string | null = null;
type AutomaticDetectionMethod = "running_game" | "default_install" | "steam_library";
let pendingAutomaticDetection: AutomaticDetectionMethod | null = null;

/** Survives restarts, unlike the session cache: a custom Steam library found
 *  once (from the running game, or picked by hand in the locate modal) stays
 *  known, instead of waiting for the game to run again after every launch. */
const SAVED_DIRECTORY_KEY = "peak-map:game-directory";

const readSavedDirectory = (): string | null => {
  try {
    return localStorage.getItem(SAVED_DIRECTORY_KEY);
  } catch {
    return null;
  }
};

const saveDirectory = (directory: string): void => {
  try {
    localStorage.setItem(SAVED_DIRECTORY_KEY, directory);
  } catch {
    // Session cache still covers this run.
  }
};

const sameDirectory = (first: string | null, second: string): boolean =>
  first !== null
  && normalizeDirectory(first).toLowerCase() === normalizeDirectory(second).toLowerCase();

const rememberDirectory = (
  directory: string,
  method?: AutomaticDetectionMethod,
): void => {
  const wasKnown = sameDirectory(cachedDirectory, directory)
    || sameDirectory(readSavedDirectory(), directory);
  cachedDirectory = directory;
  saveDirectory(directory);
  if (method && !wasKnown) pendingAutomaticDetection ??= method;
};

/** The PEAK folder found so far, for Settings to show without probing again. */
export const getCachedPeakDirectory = (): string | null => cachedDirectory;

export const resolvePeakDirectory = async (): Promise<string | null> => {
  const running = await runningGameDirectory();
  if (running) {
    rememberDirectory(running, "running_game");
    return running;
  }
  const saved = readSavedDirectory();
  const knownCandidates = cachedDirectory
    ? [cachedDirectory, ...(saved ? [saved] : []), ...DEFAULT_GAME_DIRECTORIES]
    : saved
      ? [saved, ...DEFAULT_GAME_DIRECTORIES]
    : DEFAULT_GAME_DIRECTORIES;
  for (const directory of uniqueDirectories(knownCandidates)) {
    if (await fileExists(`${directory}\\${GAME_EXECUTABLE}`)) {
      rememberDirectory(
        directory,
        sameDirectory(cachedDirectory, directory) || sameDirectory(saved, directory)
          ? undefined
          : "default_install",
      );
      return directory;
    }
  }
  const steamCandidates = await discoverAdditionalSteamDirectories();
  const steamMatches = await Promise.all(
    steamCandidates.map(async (directory) =>
      await fileExists(`${directory}\\${GAME_EXECUTABLE}`) ? directory : null,
    ),
  );
  const steamDirectory = steamMatches.find(
    (directory): directory is string => directory !== null,
  );
  if (steamDirectory) {
    rememberDirectory(steamDirectory, "steam_library");
    return steamDirectory;
  }
  return null;
};

/**
 * A manually picked folder counts as the PEAK install when it — or a `PEAK`
 * child, for players who pick `steamapps\common` — contains PEAK.exe.
 * Returns the resolved directory, or null for a bad pick.
 */
export const findSelectedPeakDirectory = async (selectedPath: string): Promise<string | null> => {
  const normalized = normalizeDirectory(selectedPath);
  for (const candidate of [
    normalized,
    `${normalized}\\PEAK`,
    `${normalized}\\steamapps\\common\\PEAK`,
  ]) {
    if (await fileExists(`${candidate}\\${GAME_EXECUTABLE}`)) return candidate;
  }
  return null;
};

/** Persist a validated manual selection so the next install pass uses it. */
export const saveSelectedPeakDirectory = (directory: string): void => {
  cachedDirectory = directory;
  saveDirectory(directory);
};

export type TrackingStatus = "ready" | "restart-required" | "pending" | "unavailable" | "failed";

const setStatus = (trackingStatus: TrackingStatus): void => {
  updatePeakSession({ trackingStatus });
};

const updateInstalledStatus = async (copied: boolean): Promise<void> => {
  const game = await runningPeakGame();
  const gameId = game && (game.processId ? "process:" + game.processId : game.sessionId || "running");
  let restartRequired = Boolean(gameId && copied);
  try {
    if (gameId && copied) localStorage.setItem(RESTART_GAME_KEY, gameId);
    else if (gameId && localStorage.getItem(RESTART_GAME_KEY) === gameId) restartRequired = true;
    else localStorage.removeItem(RESTART_GAME_KEY);
  } catch { /* The current install can still report its status when storage is unavailable. */ }
  updatePeakSession({
    trackingStatus: restartRequired ? "restart-required" : "ready",
    trackingRestartGameId: restartRequired ? gameId : null,
  });
};

let installing = false;

/**
 * Installs or updates the bridge. `force` skips the version short-circuit so
 * the Settings "reinstall" button can repair a plugin folder that a mod
 * manager, an anti-virus or a manual delete left half-written — the version
 * marker would otherwise still read as current.
 */
export const ensureTrackingBridge = async (force = false): Promise<void> => {
  if (typeof overwolf === "undefined" || installing) return;
  installing = true;
  if (force) setStatus("pending");
  try {
    const directory = await resolvePeakDirectory();
    if (!directory) {
      setStatus("unavailable");
      return;
    }
    if (pendingAutomaticDetection) {
      track(EVENTS.TRACKER_DIRECTORY_DETECTED, {
        method: pendingAutomaticDetection,
        ...installPathAnalyticsProperties(directory),
      });
      pendingAutomaticDetection = null;
    }

    const versionResponse = await fetch(`./${PAYLOAD_URL_ROOT}/${PLUGIN_PAYLOAD_PREFIX}bridge-version.txt`);
    if (!versionResponse.ok) {
      setStatus("failed");
      return;
    }
    const bundledVersion = (await versionResponse.text()).trim();
    const installedVersion = (await readText(`${directory}\\${PLUGIN_DIRECTORY}\\bridge-version.txt`))?.trim();
    const manifestResponse = await fetch("./tracking-mod/payload-manifest.json");
    if (!manifestResponse.ok) {
      setStatus("failed");
      return;
    }
    const manifest = (await manifestResponse.json()) as string[];

    const present = await Promise.all(manifest.map((file) =>
      fileExists(`${directory}\\${file.replaceAll("/", "\\")}`),
    ));
    if (!force && installedVersion === bundledVersion && present.every(Boolean)) {
      await updateInstalledStatus(false);
      return;
    }

    // Repair missing loader files without overwriting an existing loader or
    // its configuration. Refresh our plugin whenever installation is needed.
    const files = manifest.filter((file, index) =>
      file.startsWith(PLUGIN_PAYLOAD_PREFIX) || !present[index],
    );

    // Writing a marker file first creates each target directory, because
    // overwolf.io.copyFile does not create missing directories itself.
    const directories = new Set(
      files
        .filter((file) => file.includes("/"))
        .map((file) => file.slice(0, file.lastIndexOf("/"))),
    );
    for (const relativeDirectory of directories) {
      await writeText(
        `${directory}\\${relativeDirectory.replaceAll("/", "\\")}\\${INSTALL_MARKER_NAME}`,
        "Installed automatically by Peak Map.",
      );
    }
    for (const file of files) {
      await copyPackageFile(
        `${PAYLOAD_URL_ROOT}/${file}`,
        `${directory}\\${file.replaceAll("/", "\\")}`,
      );
    }
    // Files copied after PEAK has started cannot be loaded into that process.
    await updateInstalledStatus(true);
    console.info(`[Tracking] Bridge v${bundledVersion} installed into ${directory}`);
  } catch (error) {
    // Locked files while the game is running are expected during upgrades;
    // the next game start/stop transition retries automatically.
    console.warn("[Tracking] Bridge install deferred:", error);
    setStatus("pending");
  } finally {
    installing = false;
  }
};
