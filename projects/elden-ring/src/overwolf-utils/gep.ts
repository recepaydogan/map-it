/**
 * Game Events Provider (GEP) wiring for Elden Ring Nightreign.
 *
 * This is the ONLY FromSoftware title Overwolf exposes real-time events for — base
 * Elden Ring has overlay/auto-launch support but no GEP feed. Nightreign's feed is
 * deliberately thin (see dev.overwolf.com .../supported-games/elden-ring-nightreign):
 *
 *   game_info.scene : lobby | ingame | death | boss_fight   (info update)
 *   match_info events: match_start, match_end, death, boss_fight, day
 *
 * Critically, the boss_fight event carries NO boss identity — its payload is the
 * literal string "boss_fight". So we can't tell which field boss a player is on.
 * The one boss we always know is the Nightlord (the Night 3 finale), because the
 * player picks it as the expedition seed and it never spawns on the map. So this
 * module only treats a boss_fight as "the Nightlord" once the run has reached the
 * final night — tracked by counting `day` events since match_start — and asks the
 * main window to open the selected Nightlord's page (no navigation; nothing to
 * navigate to). Field-boss fights are intentionally ignored: we'd be guessing.
 *
 * Must run from the background page (long-lived). setRequiredFeatures is the
 * handshake that turns the feed on; it can fail while the game is still booting,
 * so we retry. Lives behind isOverwolf() guards so `npm run dev` is a no-op.
 */
import { isOverwolf } from "../utils/overwolf";

const NR_REQUIRED_FEATURES = ["game_info", "match_info"];

/**
 * How many `day` events must elapse within one expedition before a boss_fight is
 * treated as the final-night Nightlord. A Nightreign run is Day 1 → Day 2 → Day 3,
 * with the Nightlord at Night 3; the `day` event fires as each new day begins.
 *
 * TUNE THIS against the GEP Game Events Simulator / a live run: the exact number
 * of `day` events (and whether one fires for Day 1) isn't documented. Conservative
 * by design — better to miss an auto-open than to pop the Nightlord page mid-run.
 */
const FINAL_NIGHT_DAY_COUNT = 2;

const MAX_FEATURE_RETRIES = 8;
const RETRY_DELAY_MS = 2000;

let started = false;
let dayCount = 0;

const setFeaturesWithRetry = (attempt = 0): void => {
  overwolf.games.events.setRequiredFeatures(NR_REQUIRED_FEATURES, (res) => {
    if (res.success) {
      console.log("[GEP] Nightreign features registered:", res.supportedFeatures);
      return;
    }
    if (attempt >= MAX_FEATURE_RETRIES) {
      console.warn("[GEP] Gave up registering Nightreign features:", res);
      return;
    }
    setTimeout(() => setFeaturesWithRetry(attempt + 1), RETRY_DELAY_MS);
  });
};

const onNewEvents = (e: overwolf.games.events.NewGameEvents): void => {
  for (const ev of e.events) {
    switch (ev.name) {
      case "match_start":
      case "match_end":
        dayCount = 0; // new (or finished) expedition — reset the day counter
        break;
      case "day":
        dayCount += 1;
        break;
      case "boss_fight":
        // No boss identity in the payload — only act once we're at the final night,
        // where the boss can only be the chosen Nightlord.
        if (dayCount >= FINAL_NIGHT_DAY_COUNT) {
          console.log("[GEP] Final-night boss_fight — opening Nightlord page.");
          overwolf.windows.sendMessage("main", "gep_boss_fight", {}, () => {});
        }
        break;
      default:
        break;
    }
  }
};

const onError = (err: overwolf.games.events.ErrorEvent): void => {
  // The feed can drop when the game alt-tabs/loads; re-arm the features.
  console.warn("[GEP] error, re-registering features:", err);
  setFeaturesWithRetry();
};

/** Begin listening for Nightreign GEP events. Safe to call repeatedly. */
export const startNightreignGep = (): void => {
  if (!isOverwolf() || started) return;
  started = true;
  dayCount = 0;
  overwolf.games.events.onError.addListener(onError);
  overwolf.games.events.onNewEvents.addListener(onNewEvents);
  setFeaturesWithRetry();
  console.log("[GEP] Started Nightreign listener.");
};

/** Stop listening (e.g. when Nightreign closes). Safe to call when not started. */
export const stopNightreignGep = (): void => {
  if (!isOverwolf() || !started) return;
  started = false;
  overwolf.games.events.onError.removeListener(onError);
  overwolf.games.events.onNewEvents.removeListener(onNewEvents);
  console.log("[GEP] Stopped Nightreign listener.");
};
