/**
 * The position pipeline, ported deliberately from the Valheim companion.
 *
 * The Bridge appends one small line every fifty milliseconds. Exactly one
 * background listener relays structured samples to map windows without
 * repeatedly opening the file; a map window must never perform high-frequency
 * Overwolf IO on the same thread that animates its camera and marker.
 */
import {
  clearLivePosition,
  publishLivePosition,
  publishLivePositionSample,
} from "./live-position-store";
import { createLivePositionBroadcaster } from "./live-position-channel";
import { startLiveBridgeFileReader } from "../live-bridge/live-bridge-file-reader";
import { startLiveBridgeStreamReader } from "../live-bridge/live-bridge-stream-reader";
import { markBridgeModReady } from "../live-bridge/bridge-mod-install-store";
import {
  isFreshLivePositionBridgePayload,
  parseLivePositionBridgePayload,
  parseLivePositionStreamHandover,
  type ParsedLivePositionPayload,
} from "./live-position-payload";
import type { LivePosition } from "./live-position-types";
import { createLivePositionSourceSelector } from "./live-position-source-selector";

const BRIDGE_FILE = "PZInteractiveMap\\position.txt";
const BRIDGE_STREAM_FILE = "PZInteractiveMap\\position-stream-a.txt";
const STREAM_FILE_NAMES = ["position-stream-a.txt", "position-stream-b.txt"] as const;
/** Compatibility only. Current Bridge builds stream position lines and retire
 * this poll as soon as the first one arrives. */
const FALLBACK_READ_INTERVAL_MS = 5_000;
const LEGACY_READ_INTERVAL_MS = 200;
/**
 * localStorage remains the durable cross-window snapshot used for presence and
 * cold starts. Motion travels over BroadcastChannel, so this expensive JSON
 * write does not need to happen for every 20 Hz sample.
 */
const SHARED_PUBLISH_INTERVAL_MS = 250;

const toLivePosition = (payload: ParsedLivePositionPayload): LivePosition => ({
  version: 1,
  sequence: payload.sequence,
  x: payload.x,
  y: payload.y,
  z: payload.z,
  dx: payload.dx,
  dy: payload.dy,
  updatedAt: payload.updatedAt,
  receivedAt: Date.now(),
});

interface LivePositionReaderOptions {
  debugLabel?: string;
  publish: (position: LivePosition) => void;
  clear: () => void;
  clearOnStart: boolean;
  clearOnStop: boolean;
}

const startReader = ({
  debugLabel,
  publish,
  clear,
  clearOnStart,
  clearOnStop,
}: LivePositionReaderOptions) => {
  if (clearOnStart) clear();
  let stopped = false;
  const selector = createLivePositionSourceSelector((payload) => {
    if (stopped) return;
    if (payload) publish(toLivePosition(payload));
    else clear();
  });
  let bridgeReadyReported = false;
  const publishBridge = (payload: ParsedLivePositionPayload) => {
    if (stopped || !isFreshLivePositionBridgePayload(payload)) return;
    if (!bridgeReadyReported) {
      bridgeReadyReported = true;
      markBridgeModReady();
    }
    selector.accept("bridge", payload);
  };
  const streamAvailable = typeof overwolf !== "undefined" && Boolean(overwolf.io?.listenOnFile);
  let stopFallback: (() => void) | null = startLiveBridgeFileReader({
    debugLabel: debugLabel ? `${debugLabel} (snapshot fallback)` : undefined,
    relativePath: BRIDGE_FILE,
    readIntervalMs: streamAvailable ? FALLBACK_READ_INTERVAL_MS : LEGACY_READ_INTERVAL_MS,
    measure: true,
    parse: parseLivePositionBridgePayload,
    acceptCandidate: isFreshLivePositionBridgePayload,
    getSequence: ({ sequence }) => sequence,
    clearOnStart: false,
    clearOnStop: false,
    clear: () => undefined,
    publish: (payload) => publishBridge(payload),
  });
  const stopStream = startLiveBridgeStreamReader({
    debugLabel,
    relativePath: BRIDGE_STREAM_FILE,
    parse: parseLivePositionBridgePayload,
    publish: (payload) => publishBridge(payload),
    onFirstLine: () => {
      stopFallback?.();
      stopFallback = null;
    },
    resolveSwitch: parseLivePositionStreamHandover,
    siblingFileName: (current) => current === STREAM_FILE_NAMES[0]
      ? STREAM_FILE_NAMES[1]
      : STREAM_FILE_NAMES[0],
  });

  const stopNative = startLiveBridgeFileReader({
    debugLabel: debugLabel ? `${debugLabel} (native probe)` : undefined,
    relativePath: "PZInteractiveMapNative\\position.json",
    readIntervalMs: 200,
    parse: (content) => {
      const payload = parseLivePositionBridgePayload(content);
      return payload && isFreshLivePositionBridgePayload(payload) ? payload : null;
    },
    getSequence: ({ updatedAt }) => updatedAt,
    clearOnStart: false,
    clearOnStop: false,
    clear: () => undefined,
    publish: (payload) => {
      selector.accept("native", payload);
    },
  });

  // Re-evaluate even when both feeds stop or the standby sample has not changed.
  const selectionTimer = window.setInterval(selector.refresh, 200);

  return () => {
    stopped = true;
    window.clearInterval(selectionTimer);
    stopNative();
    stopStream();
    stopFallback?.();
    if (clearOnStop) clear();
  };
};

/**
 * The only high-frequency position listener. Samples reach every visible map
 * through BroadcastChannel, while throttled localStorage preserves presence
 * and cold-start behavior.
 */
export const startLivePositionReader = () => {
  const broadcaster = createLivePositionBroadcaster();
  let lastSharedPublishAt = 0;
  const clear = () => {
    lastSharedPublishAt = 0;
    clearLivePosition();
    broadcaster.publish(null);
  };
  const stopReader = startReader({
    debugLabel: "PZ Live Position",
    publish: (position) => {
      broadcaster.publish(position);
      const now = Date.now();
      if (lastSharedPublishAt !== 0 && now - lastSharedPublishAt < SHARED_PUBLISH_INTERVAL_MS) return;
      lastSharedPublishAt = now;
      publishLivePosition(position);
    },
    clear,
    clearOnStart: true,
    clearOnStop: true,
  });

  return () => {
    stopReader();
    broadcaster.close();
  };
};

/**
 * Compatibility fallback for an Overwolf runtime without BroadcastChannel.
 * Modern runtimes never start this reader in a map window.
 */
export const startLivePositionWindowReader = () => startReader({
  publish: publishLivePositionSample,
  clear: () => publishLivePositionSample(null),
  clearOnStart: false,
  clearOnStop: false,
});
