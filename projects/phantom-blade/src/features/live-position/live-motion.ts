import { getLatestLivePosition, subscribeLivePosition } from "./live-position-store";
import type { LivePosition } from "./live-position-types";

/** The visual position consumed by both the marker and the follow camera. */
export interface LiveMotionPosition {
  x: number;
  y: number;
}

type LiveMotionListener = (position: LiveMotionPosition | null) => void;

/**
 * Valheim glides each 20 Hz sample for 120 ms. This map uses the same pacing, but
 * advances it at a bounded cadence instead of asking software OSR to repaint a
 * CSS transition at the game frame rate.
 */
export const LIVE_MOTION_TICK_MS = 33;
export const LIVE_MOTION_GLIDE_MS = 120;

/** A step no walk explains: a teleport, a loaded save or a debug jump. */
const SNAP_WORLD_DISTANCE = 96;
const POSITION_EPSILON = 0.000_001;

const listeners = new Set<LiveMotionListener>();
let latestSample: LivePosition | null = null;
let current: LiveMotionPosition | null = null;
let from: LiveMotionPosition | null = null;
let target: LiveMotionPosition | null = null;
let startedAt = 0;
let feedAttached = false;
let motionTimer: number | null = null;

const samePoint = (left: LiveMotionPosition, right: LiveMotionPosition) =>
  Math.abs(left.x - right.x) <= POSITION_EPSILON
  && Math.abs(left.y - right.y) <= POSITION_EPSILON;

const positionAt = (now: number): LiveMotionPosition | null => {
  if (!current || !from || !target) return current;
  const progress = Math.min(1, Math.max(0, (now - startedAt) / LIVE_MOTION_GLIDE_MS));
  current = {
    x: from.x + (target.x - from.x) * progress,
    y: from.y + (target.y - from.y) * progress,
  };
  if (progress >= 1) {
    from = current;
    target = current;
  }
  return current;
};

const publishMotion = (position: LiveMotionPosition | null) => {
  for (const listener of listeners) listener(position);
};

const acceptSample = (sample: LivePosition | null) => {
  if (!sample) {
    latestSample = null;
    current = null;
    from = null;
    target = null;
    publishMotion(null);
    return;
  }

  const now = performance.now();
  const previousSample = latestSample;
  latestSample = sample;
  const next = { x: sample.x, y: sample.y };

  if (!current || !previousSample || sample.mapId !== previousSample.mapId || Math.hypot(
    sample.x - previousSample.x,
    sample.y - previousSample.y,
  ) > SNAP_WORLD_DISTANCE) {
    current = next;
    from = next;
    target = next;
    startedAt = now;
    publishMotion(current);
    return;
  }

  // A standing player keeps publishing the same coordinate. Restarting the
  // glide on every heartbeat would make the final few pixels asymptotic and
  // would recreate the lag this controller removes.
  if (target && samePoint(target, next)) return;

  const visualNow = positionAt(now);
  if (!visualNow) return;
  from = visualNow;
  target = next;
  startedAt = now;
};

const attachFeed = () => {
  if (feedAttached) return;
  feedAttached = true;
  acceptSample(getLatestLivePosition());
  subscribeLivePosition(acceptSample);
};

const move = () => {
  if (!current || !target || samePoint(current, target)) return;
  const previous = current;
  const next = positionAt(performance.now());
  if (!next || samePoint(previous, next)) return;
  publishMotion(next);
};

const startTimer = () => {
  if (motionTimer !== null || typeof window === "undefined") return;
  motionTimer = window.setInterval(move, LIVE_MOTION_TICK_MS);
};

const stopTimerWhenIdle = () => {
  if (listeners.size > 0 || motionTimer === null) return;
  window.clearInterval(motionTimer);
  motionTimer = null;
};

/** Read the exact visual point that new consumers should start from. */
export const getLatestLiveMotionPosition = (): LiveMotionPosition | null => {
  attachFeed();
  return positionAt(performance.now());
};

/**
 * One animation clock for the whole window. The player marker and follow
 * camera subscribe here, so they can never ease towards different positions.
 */
export const subscribeLiveMotion = (listener: LiveMotionListener): (() => void) => {
  attachFeed();
  listeners.add(listener);
  startTimer();
  return () => {
    listeners.delete(listener);
    stopTimerWhenIdle();
  };
};
