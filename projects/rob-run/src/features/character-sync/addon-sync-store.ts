import { useSyncExternalStore } from "react";

// Installation requests come only from an explicit user click, never a saved preference.
export const ADDON_SYNC_KEY = "wfm:addon-file-sync:v1";
export const ADDON_SYNC_EVENT = "wfm-addon-file-sync-updated";
export const ADDON_SYNC_REQUEST = "wfm-addon-file-sync-request";
export interface AddonSyncState {
  version: 1;
  status: "waiting" | "installing" | "ready" | "game-missing" | "error";
  addonVersion: string | null;
  installedAt: number | null;
  savedAt: number | null;
  checkedAt: number | null;
  scanning: boolean;
  readError: boolean;
  needsReload: boolean;
}
const initial: AddonSyncState = { version: 1, status: "waiting", addonVersion: null,
  installedAt: null, savedAt: null, checkedAt: null, scanning: false, readError: false, needsReload: true };
let cachedText: string | null | undefined;
let cached = initial;
export function getAddonSyncState(): AddonSyncState {
  let text: string | null;
  try { text = localStorage.getItem(ADDON_SYNC_KEY); } catch { return initial; }
  if (text === cachedText) return cached;
  cachedText = text;
  try {
    const value = JSON.parse(text ?? "null") as Partial<AddonSyncState> | null;
    cached = value?.version === 1 ? { version: 1,
      status: value.status && value.status !== ("disabled" as string) ? value.status : "waiting",
      addonVersion: value.addonVersion ?? null, installedAt: value.installedAt ?? null,
      savedAt: value.savedAt ?? null, checkedAt: value.checkedAt ?? null, scanning: value.scanning === true,
      readError: value.readError === true, needsReload: value.needsReload !== false } : initial;
  } catch { cached = initial; }
  return cached;
}
export function updateAddonSync(patch: Partial<Omit<AddonSyncState, "version">>) {
  const next = { ...getAddonSyncState(), ...patch };
  const text = JSON.stringify(next);
  if (text === cachedText) return;
  localStorage.setItem(ADDON_SYNC_KEY, text);
  cachedText = text; cached = next;
  window.dispatchEvent(new Event(ADDON_SYNC_EVENT));
}
export const subscribeAddonSync = (listener: () => void) => {
  const changed = (event: Event) => {
    if (!(event instanceof StorageEvent) || !event.key || event.key === ADDON_SYNC_KEY) listener();
  };
  window.addEventListener("storage", changed); window.addEventListener(ADDON_SYNC_EVENT, changed);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(ADDON_SYNC_EVENT, changed); };
};
export const useAddonSync = () => useSyncExternalStore(subscribeAddonSync, getAddonSyncState, () => initial);
export function requestAddonInstall() {
  if (getAddonSyncState().status === "installing") return;
  localStorage.setItem(ADDON_SYNC_REQUEST, crypto.randomUUID());
  window.dispatchEvent(new Event(ADDON_SYNC_REQUEST));
}
