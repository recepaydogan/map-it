import { useEffect, useRef } from "react";
import {
  capturePageview,
  initAnalytics,
  setGameRunning,
  track,
} from "../services/analytics/analytics";
import type { AnalyticsSurface } from "../services/analytics/app-context";
import {
  gaPageview,
  initGoogleAnalytics,
} from "../services/analytics/google-analytics";
import { EVENTS } from "../services/analytics/events";
import { useRunningGame } from "../features/settings/use-game-running";
import { useMapStore } from "../store/map-store";
import { type OverlayKey, useUiStore } from "../store/ui-store";
import { IS_OVERWOLF } from "../utils/platform";

/** PostHog path for each full-window surface. `null` overlay = the map
 * (Elden Ring's game-data map, or Nightreign's live map — the `game` prop
 * distinguishes them on the "/map" pageview). */
const PAGE_PATH: Record<OverlayKey, string> = {
  codex: "/archive",
  classes: "/classes",
  dialogue: "/dialogue",
  nightfarers: "/nightfarers",
  nightlords: "/nightlords",
  relics: "/relics",
  guide: "/guide",
  account: "/account",
  settings: "/settings",
  support: "/support",
  notesAdmin: "/notes-admin",
};

const pathFor = (overlay: OverlayKey | null): string =>
  overlay ? PAGE_PATH[overlay] : "/map";

/**
 * Boots analytics for a window and turns its overlay navigation into pageviews.
 *
 * Mounted once per UI window — the desktop dashboard ("desktop") and the in-game
 * overlay map ("in_game") — with every event stamped with that `surface`, so the
 * two are always separable rather than merged into one blurred total. Navigation
 * state (`activeOverlay`) is per-window, so the same tab opened in both windows
 * is two real visits, not a double count; capturePageview still de-dupes
 * identical consecutive calls so StrictMode's dev double-invoke and incidental
 * re-renders can't inflate the numbers.
 *
 * Live game state rides along too: every event carries `game_running`, and the
 * desktop window (where Overwolf's game events fire reliably) reports the
 * start/stop transitions themselves.
 */
export const useAnalytics = (surface: AnalyticsSurface = "desktop"): void => {
  useEffect(() => {
    initAnalytics(IS_OVERWOLF ? surface : "web");
    initGoogleAnalytics(); // web-only inside; a no-op in Overwolf
    track(EVENTS.APP_OPENED);
  }, [surface]);

  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const game = useMapStore((s) => s.game);

  // The chosen game is SYNCED across windows (cross-window-sync), so reacting to
  // it in the hidden overlay window would fire a second, phantom pageview for a
  // switch the player made on the desktop. Only the desktop window treats it as
  // navigation; the overlay still reports whichever game is current as a prop.
  const gameNavigationKey = surface === "desktop" ? game : "";
  useEffect(() => {
    capturePageview(pathFor(activeOverlay), {
      game: useMapStore.getState().game,
    });
    // Web only (no-op in Overwolf): the URL was already pushed by web-url-sync,
    // so GA gets the real /map/... location for this surface.
    if (!IS_OVERWOLF) {
      gaPageview({ game: useMapStore.getState().game });
    }
  }, [activeOverlay, gameNavigationKey]);

  // Is Elden Ring / Nightreign running right now? Kept on the context so EVERY
  // event splits into "at the desk" vs "mid-session" usage.
  const { running, title } = useRunningGame();
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    setGameRunning(running, title);
    // The overlay window only exists while a game runs and doesn't receive the
    // transitions reliably, so the desktop window owns these two events.
    if (surface !== "desktop") return;

    if (running) {
      startedAtRef.current = Date.now();
      track(EVENTS.GAME_STARTED);
      return;
    }
    // Skip the initial "not running" render — only a real stop is an event.
    if (startedAtRef.current === null) return;
    track(EVENTS.GAME_STOPPED, {
      session_minutes: Math.round((Date.now() - startedAtRef.current) / 60000),
    });
    startedAtRef.current = null;
  }, [running, title, surface]);
};
