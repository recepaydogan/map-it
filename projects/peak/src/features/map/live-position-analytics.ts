/**
 * Reports whether live position tracking actually worked for each PEAK game
 * session. No coordinates, player names, or filesystem paths are captured.
 */
import { getPeakSession } from "../../state/peak-session-store";
import { track } from "../../utils/analytics/analytics";
import { EVENTS } from "../../utils/analytics/events";
import {
  isDeathWarp,
  localPlayerOf,
  readLiveStateSnapshot,
  type LiveState,
} from "./live-state";

// Covers the main menu, loading into an expedition, and a slow first bridge
// tick before treating the session as unable to provide a live position.
const FIRST_FIX_GRACE_MS = 120_000;
const POSITION_CHECK_INTERVAL_MS = 1_000;

type MissingReason =
  | "game_directory_not_found"
  | "bridge_install_failed"
  | "bridge_install_pending"
  | "bridge_restart_required"
  | "bridge_status_unknown"
  | "live_state_read_failed"
  | "no_fresh_position"
  | "player_data_disabled"
  | "local_player_missing"
  | "local_position_unusable";

const disabledFeaturesOf = (sample: LiveState | null): string[] =>
  sample?.disabled ?? [];

const resolveMissingReason = (
  sample: LiveState | null,
  readFailed: boolean,
): MissingReason => {
  const { trackingStatus } = getPeakSession();
  if (trackingStatus === "unavailable") return "game_directory_not_found";
  if (trackingStatus === "failed") return "bridge_install_failed";
  if (trackingStatus === "restart-required") return "bridge_restart_required";
  if (trackingStatus === "pending") return "bridge_install_pending";
  if (trackingStatus === null) return "bridge_status_unknown";
  if (readFailed) return "live_state_read_failed";
  if (!sample) return "no_fresh_position";
  if (sample.disabled.includes("players")) return "player_data_disabled";
  const player = localPlayerOf(sample);
  if (!player) return "local_player_missing";
  if (isDeathWarp(player)) return "local_position_unusable";
  return "no_fresh_position";
};

export const startLivePositionAnalytics = (): (() => void) => {
  const startedAt = Date.now();
  let connected = false;
  let reportedMissing = false;
  let stopped = false;
  let reading = false;
  let lastSample: LiveState | null = null;
  let lastReadFailed = false;
  let positionTimer: number | null = null;

  const poll = async (): Promise<void> => {
    if (stopped || connected || reading) return;
    reading = true;
    try {
      const sample = await readLiveStateSnapshot();
      if (stopped) return;
      lastSample = sample;
      lastReadFailed = false;
      const player = localPlayerOf(sample);
      if (!sample || !player || isDeathWarp(player)) return;

      connected = true;
      window.clearTimeout(missingTimer);
      if (positionTimer !== null) window.clearInterval(positionTimer);
      track(EVENTS.LIVE_POSITION_CONNECTED, {
        wait_seconds: Math.round((Date.now() - startedAt) / 1_000),
        after_missing: reportedMissing,
        payload_version: sample.payloadVersion,
        disabled_features: disabledFeaturesOf(sample),
      });
    } catch {
      lastReadFailed = true;
    } finally {
      reading = false;
    }
  };

  const missingTimer = window.setTimeout(() => {
    if (stopped || connected) return;
    reportedMissing = true;
    const { trackingStatus } = getPeakSession();
    track(EVENTS.LIVE_POSITION_MISSING, {
      waited_seconds: Math.round(FIRST_FIX_GRACE_MS / 1_000),
      reason: resolveMissingReason(lastSample, lastReadFailed),
      tracking_status: trackingStatus,
      last_sample_seen: lastSample !== null,
      disabled_features: disabledFeaturesOf(lastSample),
    });
  }, FIRST_FIX_GRACE_MS);

  void poll();
  positionTimer = window.setInterval(() => void poll(), POSITION_CHECK_INTERVAL_MS);

  return () => {
    stopped = true;
    window.clearTimeout(missingTimer);
    if (positionTimer !== null) window.clearInterval(positionTimer);
  };
};
