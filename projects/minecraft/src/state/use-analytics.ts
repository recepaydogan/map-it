import { useEffect } from "react";
import type { MapSidebarMode } from "../features/map/map-sidebar";
import { useRunningGame } from "../features/settings/use-game-running";
import {
  capturePageview,
  initAnalytics,
  setGameRunning,
  track,
} from "../services/analytics/analytics";
import type { AnalyticsSurface } from "../services/analytics/app-context";
import { EVENTS } from "../services/analytics/events";
import { IS_OVERWOLF } from "../utils/platform";

/**
 * Boots analytics for a window and keeps live game state on its context.
 *
 * Mounted once per UI window — the desktop dashboard ("desktop") and the
 * in-game minimap ("overlay") — with every event stamped with that `surface`,
 * so the two are always separable rather than merged into one blurred total.
 *
 * Live game state rides along too: every event carries `game_running`. The
 * game_started / game_stopped PAIR is not sent from here — a UI window sees
 * only the transitions that happen while it is open, so the background window
 * (alive for the whole app session) owns it; see background-analytics.
 *
 * There is no shared navigation store here, so pageviews are reported by the
 * components that own the navigation state instead: the map workspace (sidebar
 * modes → reportMapPageview) and the dashboard shell (top-level pages
 * → reportDashboardPageview). capturePageview de-dupes identical
 * consecutive calls, so StrictMode's dev double-invoke and incidental
 * re-renders can't inflate the numbers.
 */
export const useAnalytics = (surface: AnalyticsSurface = "desktop"): void => {
  useEffect(() => {
    initAnalytics(IS_OVERWOLF ? surface : "web");
    track(EVENTS.APP_OPENED);
  }, [surface]);

  // Is the game running right now? Kept on the context so EVERY event
  // splits into "at the desk" vs "mid-session" usage.
  const { running, title } = useRunningGame();
  useEffect(() => {
    setGameRunning(running, title);
  }, [running, title]);
};

/* ──────────────────────────────────────────────────────────────────────────
 * Pageview reporters — the "pages" are the dashboard's surfaces.
 *
 * The sidebar-mode path is remembered (per window, module memory) so that when
 * the account/settings surface closes, the pageview returns to the exact map
 * screen underneath instead of a generic "/map".
 * ──────────────────────────────────────────────────────────────────────── */

const MODE_PATH: Record<MapSidebarMode, string> = {
  explore: "/map",
  saved: "/map/saved",
};

let mapPath = "/map";
let mapProps: Record<string, unknown> = {};

/** The map workspace announces its sidebar mode + active map as a pageview. */
export const reportMapPageview = (mode: MapSidebarMode, mapId: string): void => {
  mapPath = MODE_PATH[mode];
  mapProps = { map: mapId };
  capturePageview(mapPath, mapProps);
};

/** The dashboard announces navigation between its top-level pages. */
export const reportDashboardPageview = (
  page: "map" | "journeys" | "guide" | "crafting" | "seeds" | "account" | "settings" | "support",
): void => {
  if (page !== "map") capturePageview(`/${page}`);
  else capturePageview(mapPath, mapProps);
};
