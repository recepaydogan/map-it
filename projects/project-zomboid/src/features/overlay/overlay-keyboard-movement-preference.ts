export const OVERLAY_KEYBOARD_MOVEMENT_STORAGE_KEY =
  "pzim:overlay-keyboard-movement-enabled";

export const OVERLAY_MOVE_HOTKEYS = {
  move_overlay_up: { x: 0, y: -1 },
  move_overlay_down: { x: 0, y: 1 },
  move_overlay_left: { x: -1, y: 0 },
  move_overlay_right: { x: 1, y: 0 },
} as const;

export type OverlayMoveHotkeyName = keyof typeof OVERLAY_MOVE_HOTKEYS;

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: boolean | null = null;

export const getOverlayKeyboardMovementEnabled = (): boolean => {
  if (snapshot !== null) return snapshot;
  try {
    snapshot = localStorage.getItem(OVERLAY_KEYBOARD_MOVEMENT_STORAGE_KEY) !== "false";
  } catch {
    snapshot = true;
  }
  return snapshot;
};

export const setOverlayKeyboardMovementEnabled = (enabled: boolean): void => {
  snapshot = enabled;
  try {
    localStorage.setItem(OVERLAY_KEYBOARD_MOVEMENT_STORAGE_KEY, String(enabled));
  } catch {
    // The in-memory value still keeps this window functional when storage fails.
  }
  for (const listener of listeners) listener();
};

export const subscribeOverlayKeyboardMovement = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key !== OVERLAY_KEYBOARD_MOVEMENT_STORAGE_KEY &&
      event.key !== null
    ) return;
    snapshot = null;
    for (const listener of listeners) listener();
  });
}

