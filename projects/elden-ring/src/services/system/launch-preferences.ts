/**
 * Launch-behaviour preferences — does the Atlas app surface its DESKTOP window
 * around the game? Cross-window by design: the dashboard's Settings page is the
 * *writer* and the long-lived background controller (a different Overwolf window)
 * is the main *reader*. localStorage is the source of truth and a tiny external
 * store keeps every consumer in sync; the cross-window `storage` event is what
 * lets a toggle in the dashboard take effect in the background window at once —
 * without it the always-alive background page would keep acting on a stale value.
 *
 * Kept dependency-free on purpose (mirrors BF6/DL): it is imported by the
 * background controller, which must stay light. NOTE: this governs ONLY the
 * desktop app window. The in-game corner map widget always appears while a
 * targeted game runs and is deliberately NOT gated here.
 */

export interface LaunchPreferences {
  /**
   * When true (default), launching Elden Ring / Nightreign opens the Atlas
   * desktop window (which then moves itself off the game's monitor). When false
   * the background brain still runs and the in-game corner map still shows; we
   * simply never auto-open the desktop window for the game.
   */
  autoOpenInGameApp: boolean;
  /**
   * When true (default), the Roundtable companion opens with the game too and
   * parks beside the dashboard. Turning it off does NOT remove the companion —
   * it just stops it appearing on its own, leaving the hotkey as the way in.
   */
  openCompanionWithGame: boolean;
}

const STORAGE_KEY = "elden-ring-atlas:launch-preferences";

/** Preserves today's behaviour: the app opens alongside the game. */
export const DEFAULT_LAUNCH_PREFERENCES: LaunchPreferences = {
  autoOpenInGameApp: true,
  openCompanionWithGame: true,
};

/** Defensive merge — stored shape may be partial, stale, or hand-edited. */
const normalize = (raw: unknown): LaunchPreferences => {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<LaunchPreferences>;
  return {
    autoOpenInGameApp:
      typeof value.autoOpenInGameApp === "boolean"
        ? value.autoOpenInGameApp
        : DEFAULT_LAUNCH_PREFERENCES.autoOpenInGameApp,
    openCompanionWithGame:
      typeof value.openCompanionWithGame === "boolean"
        ? value.openCompanionWithGame
        : DEFAULT_LAUNCH_PREFERENCES.openCompanionWithGame,
  };
};

const readSettings = (): LaunchPreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_LAUNCH_PREFERENCES };
  } catch {
    return { ...DEFAULT_LAUNCH_PREFERENCES };
  }
};

const writeSettings = (settings: LaunchPreferences): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-fatal — a convenience preference.
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
  const next = normalize({ ...getLaunchPreferences(), ...patch });
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
