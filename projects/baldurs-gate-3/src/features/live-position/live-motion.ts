import { getLatestLivePosition, subscribeLivePosition } from "./live-position-store";
import { LiveMotionInterpolator } from "./live-motion-interpolator";
import type { LivePosition } from "./live-position-types";

/** The visual position consumed by both the marker and the follow camera. */
export interface LiveMotionPosition {
  x: number;
  y: number;
}

type LiveMotionListener = (position: LiveMotionPosition | null) => void;

/** Smooth measurement corrections without adding a full sample of latency. */
export const LIVE_MOTION_CORRECTION_MS = 140;

/** A step no walk explains: a teleport, a loaded save or a debug jump. */
const SNAP_WORLD_DISTANCE = 96;
const listeners = new Set<LiveMotionListener>();
const interpolator = new LiveMotionInterpolator(LIVE_MOTION_CORRECTION_MS, SNAP_WORLD_DISTANCE);
let feedAttached = false;
let motionFrame: number | null = null;

const publishMotion = (position: LiveMotionPosition | null) => {
  for (const listener of listeners) listener(position);
};

const startFrame = () => {
  if (motionFrame !== null || listeners.size === 0 || typeof window === "undefined") return;
  motionFrame = window.requestAnimationFrame(move);
};

const acceptSample = (sample: LivePosition | null) => {
  if (!sample) {
    interpolator.clear();
    publishMotion(null);
    return;
  }

  const now = performance.now();
  const next = { x: sample.x, y: sample.y };
  publishMotion(interpolator.accept(next, now));
  startFrame();
};

const attachFeed = () => {
  if (feedAttached) return;
  feedAttached = true;
  acceptSample(getLatestLivePosition());
  subscribeLivePosition(acceptSample);
};

function move(now: number) {
  motionFrame = null;
  if (!interpolator.isMoving(now)) return;
  const next = interpolator.positionAt(now);
  if (!next) return;
  publishMotion(next);
  startFrame();
}

const stopFrameWhenIdle = () => {
  if (listeners.size > 0 || motionFrame === null) return;
  window.cancelAnimationFrame(motionFrame);
  motionFrame = null;
};

/** Read the exact visual point that new consumers should start from. */
export const getLatestLiveMotionPosition = (): LiveMotionPosition | null => {
  attachFeed();
  return interpolator.positionAt(performance.now());
};

/**
 * One animation clock for the whole window. The player marker and follow
 * camera subscribe here, so they can never ease towards different positions.
 */
export const subscribeLiveMotion = (listener: LiveMotionListener): (() => void) => {
  attachFeed();
  listeners.add(listener);
  startFrame();
  return () => {
    listeners.delete(listener);
    stopFrameWhenIdle();
  };
};
