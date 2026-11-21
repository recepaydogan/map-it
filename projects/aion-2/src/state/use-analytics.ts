import { useEffect } from "react";
import { useRunningGame } from "../features/settings/use-game-running";
import {
  capturePageview,
  initAnalytics,
  setGameRunning,
  track,
} from "../services/optional-usage";
import type { AnalyticsSurface } from "../services/analytics/app-context";
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
 * components that own the navigation state instead: the map workspace
 * (reportMapPageview) and the dashboard shell (top-level pages
 * → reportDashboardPageview). capturePageview de-dupes identical
 * consecutive calls, so StrictMode's dev double-invoke and incidental
 * re-renders can't inflate the numbers.
 */
export const useAnalytics = (surface: AnalyticsSurface = "desktop"): void => {
  useEffect(() => {
    initAnalytics(IS_OVERWOLF ? surface : "web");
    track("APP_OPENED");
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
 * The active map is remembered (per window, module memory) so that when
 * the account/settings surface closes, the pageview returns to the map.
 * ──────────────────────────────────────────────────────────────────────── */

let mapProps: Record<string, unknown> = {};

/** The map workspace announces its active map as a pageview. */
export const reportMapPageview = (mapId: string): void => {
  mapProps = { map: mapId };
  capturePageview("/map", mapProps);
};

/** The dashboard announces top-level page navigation. */
export const reportDashboardPageview = (
  page: "map" | "reference" | "weekly-missions" | "events" | "leaderboard" | "pets" | "wings" | "titles" | "dungeons" | "items" | "quests" | "bosses" | "activities" | "achievements" | "tier-lists" | "characters" | "account" | "settings" | "support" | "updates",
): void => {
  if (page !== "map") capturePageview(`/${page}`);
  else capturePageview("/map", mapProps);
};
