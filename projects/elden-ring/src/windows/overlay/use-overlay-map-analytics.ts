import { useEffect, useRef } from "react";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { OVERLAY_MAP_WINDOW } from "../../overwolf-utils/window-manager";

/** Two "shown" signals inside this window are the same open (see below). */
const OPEN_DEDUPE_MS = 2000;

/**
 * Reports every open/close of the expanded in-game map — the surface that only
 * exists while the player is actually in the game, so its usage can't be read
 * off the desktop window's numbers at all.
 *
 * Opening and closing the overlay HIDES and re-shows the window rather than
 * closing it, so React mounts exactly once (on the first open) and every later
 * open arrives as a window state change instead. Both paths report here, with
 * the mount and its own "shown" event collapsed into one.
 *
 * The close event carries how long the map stayed up: the difference between
 * "glanced at it" and "planned a run in it" is the whole point of the overlay.
 */
export const useOverlayMapAnalytics = (): void => {
  const openedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const open = () => {
      const now = Date.now();
      // The window is shown first and loads after, so the state change that
      // opened it can land either side of this mount — take whichever comes
      // first and ignore its twin.
      if (openedAtRef.current !== null && now - openedAtRef.current < OPEN_DEDUPE_MS) {
        return;
      }
      openedAtRef.current = now;
      track(EVENTS.IN_GAME_OVERLAY_OPENED);
    };

    const close = () => {
      if (openedAtRef.current === null) return;
      const seconds = Math.round((Date.now() - openedAtRef.current) / 1000);
      openedAtRef.current = null;
      track(EVENTS.IN_GAME_OVERLAY_CLOSED, { open_seconds: seconds });
    };

    open();

    if (typeof overwolf === "undefined") return;
    const onState = (e: {
      window_name?: string;
      window_state_ex?: string;
      window_state?: string;
    }) => {
      if (e.window_name !== OVERLAY_MAP_WINDOW) return;
      const state = e.window_state_ex ?? e.window_state ?? "";
      if (state === "normal" || state === "maximized") open();
      else close();
    };
    overwolf.windows?.onStateChanged?.addListener(onState);
    return () => overwolf.windows?.onStateChanged?.removeListener(onState);
  }, []);
};
