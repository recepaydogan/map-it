/**
 * Runs the bundled Bridge mod installation and reports what changed.
 *
 * The install itself is idempotent (see bridge-mod-installer); what lives here
 * is WHEN it runs and WHICH transitions are worth an analytics event.
 *
 * Three triggers:
 *  - "launch": once per app start, from the background window.
 *  - "game_stop": a short retry sequence beginning when a session ends. These
 *    passes ACTIVATE the mod: the lists they edit belong to the game while it is
 *    up (see bridge-mod-installer), so a player who launched the app from the
 *    game gets ticked on here instead of waiting for the next app start.
 *  - "game_session": three more passes, a minute apart, once a game session
 *    begins. The Zomboid user folder is created by the GAME, so a player who
 *    installs this app before ever launching Project Zomboid has no
 *    `…\Zomboid\mods` for the launch pass to write into — it fails with "The
 *    Project Zomboid user folder could not be found." and, without these
 *    retries, stays broken until the app is restarted. Retrying after the game
 *    starts turns that dead end into a self-healing install. Each pass also
 *    re-reads mods\default.txt, so `bridgeActive` is refreshed before the live
 *    bridge grace window closes (see live-bridge-analytics).
 */
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { readBridgeModInstallStatus } from "./bridge-mod-install-store";
import {
  installBundledBridgeMod,
  retryBundledBridgeModInstallation,
  ZomboidUserFolderMissingError,
} from "./bridge-mod-installer";

export type BridgeModInstallTrigger = "launch" | "game_session" | "game_stop";

/** Passes made after a game session starts, and the gap between them. One
 *  minute apart covers a slow first launch (the folder appears while the game
 *  boots) without hammering the disk mid-session. */
const SESSION_RETRY_COUNT = 3;
const SESSION_RETRY_INTERVAL_MS = 60_000;

/** Windows and the game can hold the mod list briefly after the running-state
 * event arrives. Retry a few times at a short cadence, stopping as soon as the
 * installation and automatic activation succeed. */
const GAME_STOP_ATTEMPT_COUNT = 4;
const GAME_STOP_RETRY_INTERVAL_MS = 5_000;

/** A failure already reported this run. The persisted status covers repeats
 *  across app launches, but a session pass that fails while a good status is
 *  preserved isn't visible there — this stops the three passes from reporting
 *  the same breakage three times. Cleared by any successful install. */
let reportedFailureThisRun = false;

export const runBridgeModInstall = async (
  trigger: BridgeModInstallTrigger,
  attempt = 1,
): Promise<boolean> => {
  const previous = readBridgeModInstallStatus();
  try {
    // The launch pass is memoized (every window calling it shares one install);
    // session passes re-run it, and must not downgrade a good status over a
    // transient read of a folder the running game is writing to.
    const status = trigger === "launch"
      ? await installBundledBridgeMod()
      : await retryBundledBridgeModInstallation(true);
    if (!status) return false; // not on Overwolf — nothing was attempted
    reportedFailureThisRun = false;
    // Installation is mostly a no-op, so only a CHANGE is worth an event —
    // first install, or the moment the player finally enables the mod.
    const changed = previous?.state !== status.state
      || previous?.bridgeActive !== status.bridgeActive;
    if (changed) {
      track(EVENTS.BRIDGE_MOD_INSTALLED, {
        bridge_active: status.bridgeActive,
        // Whether this pass ticked the mod on for the player, as opposed to
        // finding it already enabled — the auto-activation success rate.
        auto_activated: status.autoActivated ?? false,
        trigger,
        attempt,
      });
    }
    // A pass can finish cleanly while Overwolf still briefly reports the game
    // as running. In that case activation is intentionally deferred and the
    // game-stop sequence must keep retrying until the state is truly installed.
    return status.state === "installed";
  } catch (error) {
    console.error(`[LiveBridge] Bridge mod installation failed (${trigger}).`, error);
    // Already reported: any non-installed status is a breakage we have logged,
    // including "awaiting_game" (the player has not run the game yet).
    if ((previous && previous.state !== "installed") || reportedFailureThisRun) return false;
    reportedFailureThisRun = true;
    track(EVENTS.BRIDGE_MOD_INSTALL_FAILED, {
      reason: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      // Not a breakage: the player has never launched the game, so the folder
      // we install into does not exist yet. Kept out of the real failure rate.
      awaiting_game: error instanceof ZomboidUserFolderMissingError,
      trigger,
      attempt,
    });
    return false;
  }
};

/**
 * Schedules the post-launch retries for one game session. Returns a stop
 * function — the caller cancels on game stop, so a short session doesn't keep
 * touching the disk after the game is gone.
 */
export const startBridgeModSessionRetries = (): (() => void) => {
  let attempt = 0;
  const timer = window.setInterval(() => {
    attempt += 1;
    if (attempt >= SESSION_RETRY_COUNT) window.clearInterval(timer);
    void runBridgeModInstall("game_session", attempt);
  }, SESSION_RETRY_INTERVAL_MS);

  return () => window.clearInterval(timer);
};

/**
 * Runs immediately after game stop, then retries sequentially while activation
 * is still failing. The returned function cancels pending work if the game is
 * launched again or the background window unloads.
 */
export const startBridgeModGameStopRetries = (): (() => void) => {
  let cancelled = false;
  let retryTimer: number | null = null;

  const runAttempt = async (attempt: number) => {
    const succeeded = await runBridgeModInstall("game_stop", attempt);
    if (cancelled || succeeded || attempt >= GAME_STOP_ATTEMPT_COUNT) return;

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void runAttempt(attempt + 1);
    }, GAME_STOP_RETRY_INTERVAL_MS);
  };

  void runAttempt(1);

  return () => {
    cancelled = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
  };
};
