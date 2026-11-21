/**
 * Launch-behaviour preferences — what the app does when the game starts.
 *
 * Cross-window by design: the dashboard's Settings page is the *writer* and the
 * long-lived background controller (a different Overwolf window) is the main
 * *reader*. localStorage is the source of truth and a tiny external store keeps
 * every consumer in sync; the cross-window `storage` event is what lets a toggle
 * in the dashboard take effect in the background window at once — without it the
 * always-alive background page would keep acting on a stale value.
 *
 * Kept dependency-free on purpose: it is imported by the background controller,
 * which must stay light.
 */

export interface LaunchPreferences {
  /**
   * When true (default), launching the game brings the desktop map
   * window to the front. When false the background brain still runs — we simply
   * never surface the desktop window for the game.
   */
  autoOpenAppWithGame: boolean;
  /**
   * When the desktop map opens with the game and another display exists, move
   * it away from the game's display. The player can opt out without disabling
   * the desktop map itself.
   */
  moveDesktopMapToSecondMonitor: boolean;
  /**
   * When true (default), the in-game minimap appears when the player enters a
   * world. Turning it off keeps the game screen clean; the overlay hotkey still
   * opens the map on demand. The field name is retained for preference migration.
   */
  showOverlayWidgetWithGame: boolean;
  /**
   * When true (default), single-monitor players get the full-app overlay
   * opened automatically shortly after the game launches. The toggle hotkey
   * still works either way.
   */
  autoOpenInGameOverlay: boolean;
}

const STORAGE_KEY = "gm:launch-preferences";

/** Preserves today's behaviour: both surfaces come up with the game. */
export const DEFAULT_LAUNCH_PREFERENCES: LaunchPreferences = {
  autoOpenAppWithGame: true,
  moveDesktopMapToSecondMonitor: true,
  showOverlayWidgetWithGame: true,
  autoOpenInGameOverlay: true,
};

/** A disabled desktop auto-open must never be bypassed by the monitor mover. */
export const shouldAutoMoveDesktopMap = (preferences: LaunchPreferences): boolean =>
  preferences.autoOpenAppWithGame && preferences.moveDesktopMapToSecondMonitor;

/** Defensive merge — stored shape may be partial, stale, or hand-edited. */
export const normalizeLaunchPreferences = (raw: unknown): LaunchPreferences => {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<LaunchPreferences>;
  return {
    autoOpenAppWithGame:
      typeof value.autoOpenAppWithGame === "boolean"
        ? value.autoOpenAppWithGame
        : DEFAULT_LAUNCH_PREFERENCES.autoOpenAppWithGame,
    moveDesktopMapToSecondMonitor:
      typeof value.moveDesktopMapToSecondMonitor === "boolean"
        ? value.moveDesktopMapToSecondMonitor
        : DEFAULT_LAUNCH_PREFERENCES.moveDesktopMapToSecondMonitor,
    showOverlayWidgetWithGame:
      typeof value.showOverlayWidgetWithGame === "boolean"
        ? value.showOverlayWidgetWithGame
        : DEFAULT_LAUNCH_PREFERENCES.showOverlayWidgetWithGame,
    autoOpenInGameOverlay:
      typeof value.autoOpenInGameOverlay === "boolean"
        ? value.autoOpenInGameOverlay
        : DEFAULT_LAUNCH_PREFERENCES.autoOpenInGameOverlay,
  };
};

const readSettings = (): LaunchPreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeLaunchPreferences(JSON.parse(raw)) : { ...DEFAULT_LAUNCH_PREFERENCES };
  } catch {
    return { ...DEFAULT_LAUNCH_PREFERENCES };
  }
};

const writeSettings = (settings: LaunchPreferences): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-fatal — a convenience preference, never worth breaking a launch over.
  }
};

// --- Reactive store (useSyncExternalStore-friendly) -------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
/** Stable snapshot reference — only changes when the value changes. */
let snapshot: LaunchPreferences | null = null;

const invalidate = (): void => {
  snapshot = null;
  for (const listener of listeners) listener();
};

export const subscribeLaunchPreferences = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLaunchPreferences = (): LaunchPreferences => {
  if (!snapshot) snapshot = readSettings();
  return snapshot;
};

/** Merge a partial update, persist, and notify this window's consumers. */
export const updateLaunchPreferences = (patch: Partial<LaunchPreferences>): void => {
  const next = normalizeLaunchPreferences({ ...getLaunchPreferences(), ...patch });
  snapshot = next;
  writeSettings(next);
  // `storage` only fires in *other* windows, so notify this one directly.
  for (const listener of listeners) listener();
};

// Pick up writes from other windows (dashboard Settings ⇄ background controller).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) invalidate();
  });
}
