import { useEffect } from "react";
import {
  capturePageview,
  initAnalytics,
  setGameRunning,
  track,
  trackImmediate,
} from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { useRunningGame } from "../../features/settings/use-game-running";
import { IS_OVERWOLF } from "../../utils/platform";

/**
 * Analytics for the companion window.
 *
 * Its own surface ("companion"), so its usage never blurs into the dashboard's:
 * the whole point of this window is that it is open DURING play, and that only
 * shows up if it's separable. There is no overlay navigation here, so it's one
 * pageview at mount rather than the dashboard's per-overlay tracking — hence its
 * own hook instead of use-analytics.
 *
 * Opens are reported here; CLOSES are not. Overwolf destroys this window rather
 * than navigating it, so its unload handlers never run and a close reported from
 * inside never leaves the machine (measured). The background window watches it
 * die instead — see background-analytics. Outside Overwolf there is no background
 * window and pagehide is real, so the web preview keeps reporting its own close.
 */
export const useCompanionAnalytics = (): void => {
  useEffect(() => {
    initAnalytics(IS_OVERWOLF ? "companion" : "web");
    // Its own named event, not app_opened-filtered-by-surface: opens and closes
    // are one pair under one name, countable without a property filter. The
    // window is closed rather than hidden between uses, so this mount IS the
    // open — one event per open, minimize/restore included in neither.
    track(EVENTS.COMPANION_OPENED);
    capturePageview("/companion");

    if (IS_OVERWOLF) return;

    const openedAt = Date.now();
    let closeSent = false;
    const onClose = () => {
      if (closeSent) return;
      closeSent = true;
      trackImmediate(EVENTS.COMPANION_CLOSED, {
        open_seconds: Math.round((Date.now() - openedAt) / 1000),
      });
    };
    // pagehide and beforeunload each cover unload cases the other can miss, so
    // listen to both and send once.
    window.addEventListener("pagehide", onClose);
    window.addEventListener("beforeunload", onClose);
    return () => {
      window.removeEventListener("pagehide", onClose);
      window.removeEventListener("beforeunload", onClose);
    };
  }, []);

  // Same split every other surface carries: was the game actually running while
  // this was used? The desktop window still owns the start/stop EVENTS — this
  // only stamps the state onto the companion's own.
  const { running, title } = useRunningGame();
  useEffect(() => {
    setGameRunning(running, title);
  }, [running, title]);
};
