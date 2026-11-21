import { useEffect } from "react";
import { startLivePositionWindowReader } from "./live-position-reader";
import {
  isLivePositionChannelAvailable,
  subscribeLivePositionChannel,
} from "./live-position-channel";
import { publishLivePositionSample } from "./live-position-store";

const CHANNEL_FALLBACK_DELAY_MS = 2_000;

/**
 * Feeds a map window without making that window poll the Bridge file.
 *
 * The background window owns the 20 Hz line stream and sends parsed samples
 * over BroadcastChannel. Receiving a small structured message is cheap;
 * repeatedly opening the snapshot on the map's main thread was not.
 *
 * A direct reader remains as a compatibility fallback for old Chromium builds
 * without BroadcastChannel.
 */
export const useLivePositionWindowSource = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    if (isLivePositionChannelAvailable()) {
      let receivedChannelSample = false;
      let stopFallbackReader: (() => void) | null = null;
      const stopChannel = subscribeLivePositionChannel((position) => {
        receivedChannelSample = true;
        stopFallbackReader?.();
        stopFallbackReader = null;
        publishLivePositionSample(position);
      });
      // Covers an old still-running background window and any Overwolf build
      // that exposes BroadcastChannel without carrying it between windows.
      const fallbackTimer = window.setTimeout(() => {
        if (receivedChannelSample || typeof overwolf === "undefined" || !overwolf.io) return;
        stopFallbackReader = startLivePositionWindowReader();
      }, CHANNEL_FALLBACK_DELAY_MS);
      return () => {
        window.clearTimeout(fallbackTimer);
        stopFallbackReader?.();
        stopChannel();
      };
    }
    if (typeof overwolf === "undefined" || !overwolf.io) return;
    return startLivePositionWindowReader();
  }, [active]);
};
