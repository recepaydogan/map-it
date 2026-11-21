import { POSITION_ADDON_CONFIG as config } from "../../game-config";
import { ensurePositionAddonInstalled, findPositionClientDirectory, readInstalledPositionAddonVersion } from "../live-position/position-addon-installer";
import { importAddonCharacters } from "../map/map-character-profiles";
import { readCharacterSnapshotValue, type CharacterSnapshot } from "./character-snapshot";
import { MAX_SNAPSHOT_BYTES, parseCharacterSavedVariables } from "./saved-variables-parser";
import { getCharacterSyncState, writeCharacterSyncState } from "./character-sync-store";
import { ADDON_SYNC_REQUEST, getAddonSyncState, updateAddonSync } from "./addon-sync-store";
import { mergeSavedCharacterBatch } from "./saved-character-merge";

const call = <T>(run: (done: (value: T | null) => void) => void): Promise<T | null> => new Promise(resolve => {
  const timer = setTimeout(() => resolve(null), 3000);
  try { run(value => { clearTimeout(timer); resolve(value); }); }
  catch { clearTimeout(timer); resolve(null); }
});
const safeSegment = (name: string) => name.length > 0 && name.length < 160 && name !== "." && name !== ".." &&
  !/[\\/:*?"<>|]/.test(name) && ![...name].some(c => c.charCodeAt(0) < 32);

/** Automatic file synchronization. No native objects, process access or Lua execution. */
export function startCharacterSync(): () => void {
  if (typeof overwolf === "undefined") return () => {};
  let disposed = false;
  const begin = () => {
    let stopped = false, busy = false, installing = false;
    let installRevision = 0;
    const texts = new Map<string, string>();
    const active = () => !disposed && !stopped;
    const scan = async () => {
      if (!active() || busy || !overwolf.io?.readTextFile) return;
      busy = true;
      try {
        updateAddonSync({ scanning: true });
        const directory = await findPositionClientDirectory();
        if (!active()) return;
        if (!directory) {
          if (!installing) updateAddonSync({ status: "game-missing", addonVersion: null, installedAt: null });
          updateAddonSync({ scanning: false }); return;
        }
        if (!installing) {
          const revision = installRevision;
          const version = await readInstalledPositionAddonVersion(directory);
          if (!active()) return;
          // An install may have started while this read-only probe was pending.
          if (!installing && revision === installRevision) {
            const addon = getAddonSyncState();
            updateAddonSync({ addonVersion: version,
              status: addon.status === "error" ? "error" : version ? "ready" : "waiting",
              ...(!version ? { installedAt: null, needsReload: true } : {}) });
          }
        }
        const accountRoot = `${directory}\\WTF\\Account`;
        const listing = await call<overwolf.io.DirResult>(done => overwolf.io.dir(accountRoot, done));
        if (!active()) return;
        const accounts = listing?.success ? (listing.data ?? []).filter(e => e.type === "dir" && safeSegment(e.name)).slice(0, 40) : [];
        const incoming: CharacterSnapshot[] = [];
        const accepted: { file: string; text: string }[] = [];
        let invalid = false, savedAt = getAddonSyncState().savedAt, currentId: string | null = null, currentAt = 0;
        for (let offset = 0; offset < accounts.length; offset += 4) {
          const results = await Promise.all(accounts.slice(offset, offset + 4).map(async account => {
            if (!active()) return null;
            const file = `${accountRoot}\\${account.name}\\SavedVariables\\${config.addonDirectory}.lua`;
            const result = await call<overwolf.io.ReadTextFileResult>(done => overwolf.io.readTextFile(file,
              { encoding: "UTF8" as overwolf.io.enums.eEncoding, maxBytesToRead: MAX_SNAPSHOT_BYTES + 1, offset: 0 }, done));
            if (!result?.success || typeof result.content !== "string" || texts.get(file) === result.content) return null;
            try {
              const root = parseCharacterSavedVariables(result.content) as { savedAt?: unknown };
              const data = readCharacterSnapshotValue(root);
              if (!data.characters.length) return null;
              const stamp = typeof root.savedAt === "number" && root.savedAt > 1_700_000_000 && root.savedAt * 1000 <= Date.now() + 300_000
                ? root.savedAt * 1000 : Math.max(...data.characters.map(c => c.updatedAt)) * 1000;
              return { file, text: result.content, data, stamp };
            } catch { return { invalid: true } as const; }
          }));
          if (!active()) return;
          for (const result of results) {
            if (!result) continue;
            if ("invalid" in result) { invalid = true; continue; }
            accepted.push({ file: result.file, text: result.text });
            incoming.push(...result.data.characters);
            savedAt = Math.max(savedAt ?? 0, result.stamp);
            if (result.data.currentId && result.stamp >= currentAt) { currentAt = result.stamp; currentId = result.data.currentId; }
          }
        }
        if (!active()) return;
        if (incoming.length) {
          const latest = getCharacterSyncState();
          const next = mergeSavedCharacterBatch(latest, incoming, currentId, currentAt);
          importAddonCharacters(Object.values(next.characters).map(character => ({ ...character,
            source: character.source === "gep" ? "gep" : "addon", syncedAt: character.updatedAt })), next.currentId, latest.currentId,
            next.currentId === next.savedCurrentId ? next.savedCurrentId : null, next.savedCurrentAt);
          if (JSON.stringify(next) !== JSON.stringify(latest)) writeCharacterSyncState(next);
        }
        for (const result of accepted) texts.set(result.file, result.text);
        const addon = getAddonSyncState();
        updateAddonSync({ savedAt, scanning: false, checkedAt: Date.now(), readError: invalid || !listing?.success,
          needsReload: !addon.addonVersion || !savedAt || Boolean(addon.installedAt && savedAt < addon.installedAt) });
      } catch {
        if (active()) updateAddonSync({ scanning: false, readError: true, checkedAt: Date.now() });
      } finally { busy = false; }
    };
    const install = async () => {
      if (!active() || installing) return;
      installing = true;
      installRevision++;
      updateAddonSync({ status: "installing" });
      try {
        const result = await ensurePositionAddonInstalled();
        if (!active()) return;
        if (result.state === "installed") updateAddonSync({ status: "ready", addonVersion: result.version,
          ...(result.changed ? { installedAt: Date.now(), needsReload: true } : {}) });
        else updateAddonSync({ status: result.state === "not-found" ? "game-missing" : "error" });
      } catch {
        if (active()) updateAddonSync({ status: "error" });
      } finally {
        installing = false;
        if (active()) void scan();
      }
    };
    updateAddonSync({ scanning: false, readError: false, status: "waiting" });
    void scan();
    const scanTimer = window.setInterval(() => { void scan(); }, 5000);
    const request = (event: Event) => {
      if (event.type === ADDON_SYNC_REQUEST || (event instanceof StorageEvent && event.key === ADDON_SYNC_REQUEST && event.newValue)) void install();
    };
    window.addEventListener("storage", request); window.addEventListener(ADDON_SYNC_REQUEST, request);
    return () => { stopped = true; window.clearInterval(scanTimer);
      window.removeEventListener("storage", request); window.removeEventListener(ADDON_SYNC_REQUEST, request); };
  };
  const stopSession = begin();
  return () => { disposed = true; stopSession(); };
}
