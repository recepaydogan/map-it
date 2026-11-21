/**
 * Did the live link actually work this game session?
 *
 * The bundled Bridge mod writes the player's position to disk and the readers
 * pick it up — but that whole chain only works if the player also ENABLED the
 * mod in their Zomboid mod list. Nothing in the app can ask them; the only
 * honest signal is whether a position ever arrived. So one of two events is sent
 * per game session: LIVE_POSITION_CONNECTED with how long the first fix took, or
 * LIVE_POSITION_MISSING once the grace window passes with nothing.
 *
 * Runs in the BACKGROUND window, alongside the readers it observes (see
 * background-controller), and is started/stopped with them — so exactly one of
 * the pair is reported per session, never one per app launch.
 */
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  LIVE_POSITION_EVENT,
  readLivePosition,
} from "../live-position/live-position-store";
import { readBridgeModInstallStatus } from "./bridge-mod-install-store";

/** How long a session gets to produce its first position before we call it
 *  missing. Generous on purpose: it covers the main menu, loading a save and a
 *  slow first tick, so a normal player is never reported as broken. */
const FIRST_FIX_GRACE_MS = 120_000;

export const startLiveBridgeAnalytics = (): (() => void) => {
  const startedAt = Date.now();
  let connected = false;
  let reportedMissing = false;

  const missingTimer = window.setTimeout(() => {
    if (connected) return;
    reportedMissing = true;
    track(EVENTS.LIVE_POSITION_MISSING, {
      waited_seconds: Math.round(FIRST_FIX_GRACE_MS / 1000),
      // Whether the mod was in the player's mod list at app launch — the usual
      // difference between "not installed" and "installed but never enabled".
      bridge_active: readBridgeModInstallStatus()?.bridgeActive ?? null,
    });
  }, FIRST_FIX_GRACE_MS);

  const onPositionChanged = () => {
    // Clearing the store on game stop fires this too; only a real fix counts.
    if (connected || !readLivePosition()) return;
    connected = true;
    window.clearTimeout(missingTimer);
    track(EVENTS.LIVE_POSITION_CONNECTED, {
      wait_seconds: Math.round((Date.now() - startedAt) / 1000),
      // A player who sat in the main menu past the grace window already
      // produced a LIVE_POSITION_MISSING; this flag pairs the two so the
      // "broken setups" count can exclude them.
      after_missing: reportedMissing,
    });
  };

  window.addEventListener(LIVE_POSITION_EVENT, onPositionChanged);
  return () => {
    window.clearTimeout(missingTimer);
    window.removeEventListener(LIVE_POSITION_EVENT, onPositionChanged);
  };
};
