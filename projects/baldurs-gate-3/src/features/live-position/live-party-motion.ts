import {
  getLatestLivePartyPosition,
  subscribeLivePartyPosition,
} from "./live-party-position-store";
import { LIVE_MOTION_CORRECTION_MS, type LiveMotionPosition } from "./live-motion";
import { LiveMotionInterpolator } from "./live-motion-interpolator";
import type { LivePartyPositionSnapshot } from "./live-position-types";

type LivePartyMotionListener = (positions: Readonly<Record<string, LiveMotionPosition>>) => void;

const SNAP_WORLD_DISTANCE = 96;
const listeners = new Set<LivePartyMotionListener>();
const interpolators = new Map<string, LiveMotionInterpolator>();
let feedAttached = false;
let motionFrame: number | null = null;

const startFrame = () => {
  if (motionFrame !== null || listeners.size === 0 || typeof window === "undefined") return;
  motionFrame = window.requestAnimationFrame(move);
};

const currentPositions = () => Object.fromEntries(
  [...interpolators.entries()].flatMap(([id, interpolator]) => {
    const position = interpolator.positionAt(performance.now());
    return position ? [[id, position] as const] : [];
  }),
);

const publishMotion = () => {
  const positions = currentPositions();
  for (const listener of listeners) listener(positions);
};

const acceptSnapshot = (snapshot: LivePartyPositionSnapshot | null) => {
  if (!snapshot) {
    interpolators.clear();
    publishMotion();
    return;
  }
  const ids = new Set(Object.keys(snapshot.players));
  for (const id of interpolators.keys()) {
    if (!ids.has(id)) interpolators.delete(id);
  }
  const now = performance.now();
  for (const [id, position] of Object.entries(snapshot.players)) {
    const interpolator = interpolators.get(id)
      ?? new LiveMotionInterpolator(LIVE_MOTION_CORRECTION_MS, SNAP_WORLD_DISTANCE);
    interpolators.set(id, interpolator);
    interpolator.accept(position, now);
  }
  publishMotion();
  startFrame();
};

const attachFeed = () => {
  if (feedAttached) return;
  feedAttached = true;
  acceptSnapshot(getLatestLivePartyPosition());
  subscribeLivePartyPosition(acceptSnapshot);
};

function move(now: number) {
  motionFrame = null;
  if (![...interpolators.values()].some((interpolator) => interpolator.isMoving(now))) return;
  publishMotion();
  startFrame();
}

const stopFrameWhenIdle = () => {
  if (listeners.size > 0 || motionFrame === null) return;
  window.cancelAnimationFrame(motionFrame);
  motionFrame = null;
};

export const getLatestLivePartyMotionPositions = () => {
  attachFeed();
  return currentPositions();
};

export const subscribeLivePartyMotion = (listener: LivePartyMotionListener): (() => void) => {
  attachFeed();
  listeners.add(listener);
  startFrame();
  return () => {
    listeners.delete(listener);
    stopFrameWhenIdle();
  };
};
