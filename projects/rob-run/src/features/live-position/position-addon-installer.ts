import { GAME_CONFIG, POSITION_ADDON_CONFIG as config } from "../../game-config";
import en from "../../i18n/locales/en.json";
import {
  ADDON_CACHE_KEY, downloadPositionAddon, normalizeAddonText as normalizeContents, readCachedPositionAddon,
} from "./position-addon-package";

type GamePathInfo = { executionPath?: string } | null;
const normalize = (value: string) => value.trim().replace(/^"|"$/g, "").replaceAll("/", "\\").replace(/\\+$/, "");

/** Reject other WoW clients and traversal before constructing any write path. */
export const positionAddonDirectoryFromPath = (value?: string): string | null => {
  let path = normalize(value ?? "");
  if (!/^[a-z]:\\/i.test(path) || path.split("\\").some((part) => part === ".." || part === ".") ||
      [...path].some((character) => character.charCodeAt(0) < 32)) return null;
  if (path.toLowerCase().endsWith(`\\${config.executable.toLowerCase()}`)) {
    path = path.slice(0, -(config.executable.length + 1));
  }
  return path.toLowerCase().endsWith(`\\${config.clientDirectory}`) ? path : null;
};

const probe = <T>(run: (done: (value: T | null) => void) => void): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    try {
      run((value) => { clearTimeout(timer); resolve(value); });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });

const readText = async (path: string): Promise<string | null> => {
  const result = await probe<overwolf.io.ReadFileContentsResult>((done) =>
    overwolf.io.readFileContents(path, "UTF8" as overwolf.io.enums.eEncoding, done));
  return result?.success && typeof result.content === "string" ? normalizeContents(result.content) : null;
};

async function findClient(info?: GamePathInfo): Promise<string | null> {
  const running = info ?? await probe<overwolf.games.GetRunningGameInfoResult>((done) =>
    overwolf.games.getRunningGameInfo(done));
  const runningDirectory = positionAddonDirectoryFromPath(running?.executionPath);
  if (runningDirectory) return runningDirectory;
  const installed = await probe<overwolf.games.GetGameInfoResult>((done) =>
    overwolf.games.getGameInfo(GAME_CONFIG.gameClassIds[0]!, done));
  const candidates = [
    positionAddonDirectoryFromPath(installed?.success ? installed.gameInfo?.ProcessPath : undefined),
    ...[overwolf.io.paths?.programFilesX86 ?? "C:\\Program Files (x86)",
      overwolf.io.paths?.programFiles ?? "C:\\Program Files"].map((root) =>
      positionAddonDirectoryFromPath(`${root}\\${config.installDirectory}\\${config.clientDirectory}`)),
  ];
  for (const directory of new Set(candidates.filter((path): path is string => Boolean(path)))) {
    const result = await probe<overwolf.io.FileExistsResult>((done) =>
      overwolf.io.fileExists(`${directory}\\${config.executable}`, done));
    if (result?.success && result.found) return directory;
  }
  return null;
}

export { findClient as findPositionClientDirectory };

/** Detect an existing installation without contacting the CDN or repairing files. */
export async function readInstalledPositionAddonVersion(directory: string): Promise<string | null> {
  const client = positionAddonDirectoryFromPath(directory);
  if (!client) return null;
  const destination = `${client}\\Interface\\AddOns\\${config.addonDirectory}`;
  const toc = await readText(`${destination}\\${config.addonDirectory}.toc`);
  const version = toc?.match(/^## Version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
  if (!toc || !version || !toc.split("\n").some(line => line.trim() === `## SavedVariables: ${config.savedVariables}`)) return null;
  const lua = toc.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  if (lua.length !== 1 || !/^wfm-position-bridge(?:-[a-f0-9]{64})?\.lua$/.test(lua[0])) return null;
  const exists = await probe<overwolf.io.FileExistsResult>(done => overwolf.io.fileExists(`${destination}\\${lua[0]}`, done));
  return exists?.success && exists.found ? version : null;
}

export type AddonInstallResult = {
  state: "installed"; changed: boolean; version: string; source: "cdn" | "cache";
} | { state: "not-found" | "error" };

const listeners = new Set<(result: AddonInstallResult) => void>();
export const subscribePositionAddonUpdates = (listener: (result: AddonInstallResult) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

async function writeText(path: string, content: string): Promise<void> {
  // UAC can take longer than a normal file read. A missing callback must not hang the updater forever.
  const result = await new Promise<overwolf.Result | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 60_000);
    try {
      overwolf.io.writeFileContents(path, content, "UTF8" as overwolf.io.enums.eEncoding, true,
        (result) => { clearTimeout(timer); resolve(result); });
    } catch { clearTimeout(timer); resolve(null); }
  });
  if (!result?.success || await readText(path) !== normalizeContents(content)) {
    throw new Error(result?.error ?? "Addon file write/verification failed");
  }
}

async function install(info?: GamePathInfo): Promise<AddonInstallResult> {
  if (typeof overwolf === "undefined" || !overwolf.io?.writeFileContents) return { state: "not-found" };
  const directory = await findClient(info);
  if (!directory) {
    console.info("[PositionAddon] Forever installation not found");
    return { state: "not-found" };
  }
  const destination = `${directory}\\Interface\\AddOns\\${config.addonDirectory}`;
  let source: "cdn" | "cache" = "cdn";
  const verified = await downloadPositionAddon().catch(async (error: unknown) => {
    console.warn("[PositionAddon] CDN unavailable; trying last installed package", error);
    source = "cache";
    const cached = await readCachedPositionAddon();
    if (!cached) throw new Error("No verified addon package available", { cause: error });
    return cached;
  });
  const { addon } = verified;
  // A failed/interrupted Lua download or write cannot overwrite the currently referenced Lua.
  // Only the small TOC switches the game to the complete, verified release.
  const luaName = `${config.addonDirectory}-${verified.sha256}.lua`;
  const files = [
    { name: luaName, content: addon.lua },
    // Write the TOC last so a new addon is discoverable only after its Lua exists.
    { name: `${config.addonDirectory}.toc`, content: [
      `## Interface: ${addon.interfaceVersion}`,
      `## Title: ${en.positionAddon.title}`,
      `## Notes: ${en.positionAddon.notes}`,
      `## Version: ${addon.version}`,
      "## DefaultState: enabled",
      `## SavedVariables: ${config.savedVariables}`, "", luaName, "",
    ].join("\n") },
  ];
  let changed = false;
  for (const file of files) {
    const path = `${destination}\\${file.name}`;
    const previous = await readText(path);
    if (previous === normalizeContents(file.content)) continue;
    try { await writeText(path, file.content); }
    catch (error) {
      // Preserve the previous release if the TOC write failed or its read-back was corrupt.
      if (file.name.endsWith(".toc") && previous !== null) {
        try { await writeText(path, previous); }
        catch (rollbackError) { console.error("[PositionAddon] TOC restore failed", rollbackError); }
      }
      throw error;
    }
    changed = true;
  }
  // Installing files does not establish whether the running game loaded the addon.
  try { localStorage.setItem(ADDON_CACHE_KEY, JSON.stringify({ sha256: verified.sha256, serialized: verified.serialized })); }
  catch (error) { console.warn("[PositionAddon] Could not cache installed package", error); }
  console.info(`[PositionAddon] ${changed ? "Installed" : "Already installed"}`, destination, addon.version, source);
  return { state: "installed", changed, version: addon.version, source };
}

// Coalesce simultaneous install-button clicks from different app windows.
let pendingInstall: Promise<AddonInstallResult> | null = null;
export const ensurePositionAddonInstalled = (info?: GamePathInfo): Promise<AddonInstallResult> => {
  if (!pendingInstall) {
    pendingInstall = install(info)
      .catch((error: unknown): AddonInstallResult => {
        console.error("[PositionAddon] Installation failed", error);
        return { state: "error" };
      })
      .then((result) => {
        for (const listener of listeners) {
          try { listener(result); } catch (error) { console.error("[PositionAddon] Update listener failed", error); }
        }
        return result;
      })
      .finally(() => { pendingInstall = null; });
  }
  return pendingInstall;
};
