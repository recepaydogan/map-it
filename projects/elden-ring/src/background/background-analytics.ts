import { initAnalytics, trackImmediate } from "../services/analytics/analytics";
import { EVENTS } from "../services/analytics/events";
import { COMPANION_WINDOW_NAME } from "../windows/companion/open-companion";

/** Overwolf window states in which a window is actually on screen. */
const VISIBLE_STATES = new Set(["normal", "maximized"]);

interface WindowStateEvent {
  window_name?: string;
  window_state_ex?: string;
  window_state?: string;
}

/**
 * The one thing analytics can only see from the BACKGROUND window: the companion
 * being closed.
 *
 * A closing window cannot report its own close. Overwolf does not run the page's
 * unload handlers when it tears a window down (`overwolf.windows.close` kills the
 * window, it doesn't navigate it), so the `pagehide`/`beforeunload` capture this
 * used to rely on never left the machine — measured, not assumed. The background
 * window is alive for the whole app session and receives `onStateChanged` for
 * EVERY window in the extension (the same mechanism the overlay-map exclusive-mode
 * logic already runs on), so it can watch the companion die from the outside.
 *
 * That covers all three close paths at once — title-bar X, the toggle hotkey, and
 * app shutdown — because each of them ends in the same window-state change.
 *
 * Opens stay with the companion window itself: it is CLOSED rather than hidden,
 * so it mounts exactly once per open and can report that reliably. Minimize is
 * deliberately not a close — the window is still there, and the open it would
 * pair with never fired.
 */
export const startBackgroundAnalytics = (): (() => void) => {
  initAnalytics("background");
  if (typeof overwolf === "undefined") return () => {};

  // Set on the first visible state and held across minimize/restore, so the
  // reported lifetime is the whole time the window existed, not the time since
  // it was last un-minimized. Null means "not open as far as we saw" — and then
  // no close is reported at all: obtaining a declared window (as the shutdown
  // path does) can close one that was never actually shown, and a phantom close
  // is worse than a missing one.
  let openedAt: number | null = null;

  const onState = (event: WindowStateEvent) => {
    if (event.window_name !== COMPANION_WINDOW_NAME) return;
    const state = event.window_state_ex ?? event.window_state ?? "";

    if (VISIBLE_STATES.has(state)) {
      openedAt ??= Date.now();
      return;
    }
    if (state !== "closed" || openedAt === null) return;

    const seconds = Math.round((Date.now() - openedAt) / 1000);
    openedAt = null;
    // sendBeacon, because on the app-shutdown path this window is closed moments
    // later; `surface`, because the event is ABOUT the companion — it just isn't
    // sent from it.
    trackImmediate(EVENTS.COMPANION_CLOSED, {
      surface: "companion",
      open_seconds: seconds,
    });
  };

  overwolf.windows?.onStateChanged?.addListener(onState);
  return () => overwolf.windows?.onStateChanged?.removeListener(onState);
};
