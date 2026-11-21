import { subscribeSelectionChanges, useSaveTracking } from "./save-tracking-store";
import { createCharacterDiscovery } from "./character-discovery";
import type { SavedCharacter, SaveReaderPlugin, SaveReaderResult } from "./types";

const isCharacter = (value: unknown): value is SavedCharacter => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedCharacter>;
  return typeof item.id === "string" && typeof item.name === "string"
    && typeof item.checksum === "string" && Number.isInteger(item.slot)
    && [item.x, item.y, item.z, item.savedAt].every((number) => typeof number === "number" && Number.isFinite(number))
    && [item.map, item.headerMap].every((map) => Array.isArray(map) && map.length === 4
      && map.every((part) => Number.isInteger(part) && part >= 0 && part <= 255));
};

const loadPlugin = (): Promise<SaveReaderPlugin> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error("Save reader plugin did not respond. Reload the extension.")), 10000);
  overwolf.extensions.current.getExtraObject("elden-ring-save-reader", (result) => {
    window.clearTimeout(timer);
    const plugin = result.object as SaveReaderPlugin | undefined;
    if (!plugin || typeof plugin.Read !== "function") {
      reject(new Error("Save reader plugin is unavailable. Reload the extension."));
    } else resolve(plugin);
  });
});

const read = (plugin: SaveReaderPlugin): Promise<SaveReaderResult> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error("Save reader timed out.")), 10000);
  try {
    plugin.Read((json) => {
      window.clearTimeout(timer);
      try {
        const result = JSON.parse(json) as SaveReaderResult;
        if (!["ready", "no-save", "retry", "error"].includes(result.state)
          || (result.state === "ready" && (!Array.isArray(result.characters) || !result.characters.every(isCharacter)))) {
          throw new Error("Invalid save reader response.");
        }
        resolve(result);
      } catch (error) { reject(error); }
    });
  } catch (error) { window.clearTimeout(timer); reject(error); }
});

// One serialized polling loop per window, shared by all mounted consumers.
let subscribers = 0;
let stop: (() => void) | undefined;
const ERROR_GRACE_MS = 60_000;
export const subscribeSaveReader = () => {
  subscribers++;
  if (subscribers === 1) {
    let disposed = false;
    let timer: number | undefined;
    let plugin: SaveReaderPlugin | undefined;
    let errorSince: number | undefined;
    const discoverCharacter = createCharacterDiscovery();
    const unsubscribeSelection = subscribeSelectionChanges();
    const reportError = (error: string) => {
      errorSince ??= Date.now();
      useSaveTracking.setState({
        state: Date.now() - errorSince < ERROR_GRACE_MS ? "waiting" : "error",
        error,
      });
    };
    const poll = async () => {
      try {
        plugin ??= await loadPlugin();
        if (disposed) return;
        const result = await read(plugin);
        if (disposed) return;
        if (result.state === "error") {
          reportError(result.error ?? "Save reader failed.");
        } else {
          errorSince = undefined;
          if (result.state === "ready" && result.characters) {
            const newCharacterId = discoverCharacter(result.characters, result.activeId ?? null);
            if (newCharacterId) useSaveTracking.getState().select(newCharacterId);
          }
          useSaveTracking.setState({
            state: result.state,
            error: result.error ?? null,
            ...(result.state === "ready" || result.state === "no-save"
              ? { characters: result.characters ?? [], activeId: result.activeId ?? null } : {}),
          });
        }
      } catch (error) {
        if (disposed) return;
        console.warn("[save-tracking] Read failed", error);
        reportError(String(error));
        plugin = undefined;
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    stop = () => { disposed = true; window.clearTimeout(timer); unsubscribeSelection(); };
  }
  return () => { subscribers--; if (subscribers === 0) { stop?.(); stop = undefined; } };
};
