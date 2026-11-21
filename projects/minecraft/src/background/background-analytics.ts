import {
  initAnalytics,
  setGameRunning,
  track,
  trackImmediate,
} from "../services/analytics/analytics";
import { EVENTS } from "../services/analytics/events";
import { IN_GAME_WINDOW, OVERLAY_MAP_WINDOW } from "../overwolf-utils/window-manager";

/** Overwolf window states in which a window is actually on screen. */
const VISIBLE_STATES = new Set(["normal", "maximized"]);

/** States that end a visible stretch. Minimized is deliberately neither: the
 *  overlay is never minimized by our code, so treating it as a close could pair
 *  a phantom close with no open. */
const GONE_STATES = new Set(["hidden", "closed"]);

interface WindowStateEvent {
  window_name?: string;
  window_state_ex?: string;
  window_state?: string;
}

/** The windows whose visibility only the background can see, with the event
 *  pair and the surface each one is ABOUT. */
const WATCHED_WINDOWS = new Map([
  [
    OVERLAY_MAP_WINDOW,
    { surface: "overlay", opened: EVENTS.OVERLAY_OPENED, closed: EVENTS.OVERLAY_CLOSED },
  ],
  [
    IN_GAME_WINDOW,
    { surface: "in_game", opened: EVENTS.IN_GAME_APP_OPENED, closed: EVENTS.IN_GAME_APP_CLOSED },
  ],
]);

/** Set by the background controller right before it auto-opens the in-game app,
 *  so the next open is reported as "auto" rather than a hotkey press. */
let inGameAutoOpenPending = false;

export const noteInGameAutoOpen = (): void => {
  inGameAutoOpenPending = true;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Game session pair (game_started / game_stopped)
 *
 * Reported from the BACKGROUND window because it is the only window alive for
 * the whole app session: the desktop window can sit in the tray across an
 * entire play session, and the overlay windows only exist while the game runs.
 * Deliberately ONE reporter, so a session with the dashboard open can't be
 * counted twice.
 * ──────────────────────────────────────────────────────────────────────── */

let sessionRunning = false;
let sessionStartedAt: number | null = null;

/**
 * Report a change in whether the game is running, and keep this window's
 * `game_running` context in step. Safe to call with the state it already holds
 * — only a real transition is an event.
 */
export const reportGameRunning = (running: boolean, title?: string | null): void => {
  setGameRunning(running, title);
  if (running === sessionRunning) return;
  sessionRunning = running;

  if (running) {
    sessionStartedAt = Date.now();
    track(EVENTS.GAME_STARTED);
    return;
  }
  // No start on record means the app opened after this session began; a stop
  // with no matching start would report a bogus duration.
  if (sessionStartedAt === null) return;
  const startedAt = sessionStartedAt;
  sessionStartedAt = null;
  // sendBeacon: players commonly quit the app right after the game, and a
  // normal batched request would die with the window.
  trackImmediate(EVENTS.GAME_STOPPED, {
    session_minutes: Math.round((Date.now() - startedAt) / 60000),
  });
};

/**
 * The one thing analytics can only see from the BACKGROUND window: the in-game
 * windows appearing and disappearing. They are hidden and shown from the
 * outside (hotkeys, game start/stop, auto-open, shutdown) and Overwolf does not
 * run a page's unload handlers when a window is torn down, so a window can't
 * observe its own visibility; this window receives `onStateChanged` for every
 * window in the extension and reports both sides of each pair.
 */
export const startBackgroundAnalytics = (): (() => void) => {
  initAnalytics("background");
  if (typeof overwolf === "undefined") return () => {};

  // Holds a timestamp per window while it is on screen. A missing entry means
  // "not visible as far as we saw" — and then no close is reported at all: a
  // phantom close is worse than a missing one.
  const openedAt = new Map<string, number>();

  const onState = (event: WindowStateEvent) => {
    const windowName = event.window_name ?? "";
    const watched = WATCHED_WINDOWS.get(windowName);
    if (!watched) return;
    const state = event.window_state_ex ?? event.window_state ?? "";

    if (VISIBLE_STATES.has(state)) {
      if (openedAt.has(windowName)) return; // restore after minimize — same stretch
      openedAt.set(windowName, Date.now());
      const autoOpened = windowName === IN_GAME_WINDOW && inGameAutoOpenPending;
      inGameAutoOpenPending = false;
      track(watched.opened, {
        surface: watched.surface,
        ...(windowName === IN_GAME_WINDOW ? { source: autoOpened ? "auto" : "manual" } : {}),
      });
      return;
    }
    const startedAt = openedAt.get(windowName);
    if (!GONE_STATES.has(state) || startedAt === undefined) return;

    openedAt.delete(windowName);
    // sendBeacon, because on the app-shutdown path this window dies moments
    // later and a normal batched request would be cancelled with it.
    trackImmediate(watched.closed, {
      surface: watched.surface,
      open_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
  };

  overwolf.windows?.onStateChanged?.addListener(onState);
  return () => overwolf.windows?.onStateChanged?.removeListener(onState);
};
