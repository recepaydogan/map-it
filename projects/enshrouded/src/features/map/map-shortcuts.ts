import { useSyncExternalStore } from "react";

export type MapShortcutAction = "search" | "zoomIn" | "zoomOut" | "close";
export interface MapShortcutBinding {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}
export type MapShortcuts = Record<MapShortcutAction, MapShortcutBinding>;

const STORAGE_KEY = "enshrouded:map-shortcuts:v1";
const actions: MapShortcutAction[] = ["search", "zoomIn", "zoomOut", "close"];
export const DEFAULT_MAP_SHORTCUTS: MapShortcuts = {
  search: { key: "k", ctrl: true, alt: false, shift: false, meta: false },
  zoomIn: { key: "=", ctrl: false, alt: false, shift: false, meta: false },
  zoomOut: { key: "-", ctrl: false, alt: false, shift: false, meta: false },
  close: { key: "Escape", ctrl: false, alt: false, shift: false, meta: false },
};

const normalizedKey = (key: string) => key.length === 1 ? key.toLocaleLowerCase("en") : key;
const isBinding = (value: unknown): value is MapShortcutBinding => {
  if (!value || typeof value !== "object") return false;
  const binding = value as Record<string, unknown>;
  return typeof binding.key === "string" && binding.key.length > 0
    && ["ctrl", "alt", "shift", "meta"].every((modifier) => typeof binding[modifier] === "boolean");
};
const read = (): MapShortcuts => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return DEFAULT_MAP_SHORTCUTS;
    const values = stored as Record<string, unknown>;
    return Object.fromEntries(actions.map((action) => [action,
      isBinding(values[action]) ? values[action] : DEFAULT_MAP_SHORTCUTS[action]])) as MapShortcuts;
  } catch {
    return DEFAULT_MAP_SHORTCUTS;
  }
};

let shortcuts = typeof window === "undefined" ? DEFAULT_MAP_SHORTCUTS : read();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
const save = (next: MapShortcuts) => {
  shortcuts = next;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep this session's binding. */ }
  notify();
};

export const useMapShortcuts = (): MapShortcuts => useSyncExternalStore(
  (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => shortcuts,
  () => DEFAULT_MAP_SHORTCUTS,
);
export const setMapShortcut = (action: MapShortcutAction, binding: MapShortcutBinding) =>
  save({ ...shortcuts, [action]: { ...binding, key: normalizedKey(binding.key) } });
export const resetMapShortcut = (action: MapShortcutAction) =>
  save({ ...shortcuts, [action]: DEFAULT_MAP_SHORTCUTS[action] });
export const shortcutFromEvent = (event: KeyboardEvent): MapShortcutBinding => ({
  key: normalizedKey(event.key), ctrl: event.ctrlKey, alt: event.altKey,
  shift: event.shiftKey, meta: event.metaKey,
});
export const sameMapShortcut = (left: MapShortcutBinding, right: MapShortcutBinding) =>
  normalizedKey(left.key) === normalizedKey(right.key)
  && left.ctrl === right.ctrl && left.alt === right.alt
  && left.shift === right.shift && left.meta === right.meta;
export const matchesMapShortcut = (event: KeyboardEvent, binding: MapShortcutBinding,
  action: MapShortcutAction): boolean => {
  // The default zoom-in key works with both = and its shifted + character.
  if (action === "zoomIn" && sameMapShortcut(binding, DEFAULT_MAP_SHORTCUTS.zoomIn)
    && !event.ctrlKey && !event.altKey && !event.metaKey
    && (event.key === "=" || event.key === "+")) return true;
  return sameMapShortcut(shortcutFromEvent(event), binding);
};
export const formatMapShortcut = (binding: MapShortcutBinding, action?: MapShortcutAction) => {
  const modifiers = [binding.ctrl && "Ctrl", binding.alt && "Alt", binding.shift && "Shift",
    binding.meta && "Win"].filter(Boolean);
  const key = action === "zoomIn" && sameMapShortcut(binding, DEFAULT_MAP_SHORTCUTS.zoomIn)
    ? "+ / =" : binding.key === "Escape" ? "Esc" : binding.key === " " ? "Space"
      : binding.key.length === 1 ? binding.key.toLocaleUpperCase("en") : binding.key;
  return [...modifiers, key].join(" + ");
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    shortcuts = read();
    notify();
  });
}
