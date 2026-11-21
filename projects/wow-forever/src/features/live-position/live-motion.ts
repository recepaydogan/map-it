import { getLatestLivePosition, subscribeLivePosition } from "./live-position-store";
import type { LivePosition } from "./live-position-types";

/** The visual position consumed by both the marker and the follow camera. */
export interface LiveMotionPosition {
  x: number;
  y: number;
}

type LiveMotionListener = (position: LiveMotionPosition | null) => void;

/** Limit writes to the marker and camera to one shared tick per rendered window. */
export const LIVE_MOTION_TICK_MS = 33;
export const LIVE_MOTION_GLIDE_MS = 120;

const OCR_DEFAULT_GLIDE_MS = 500;
const OCR_MIN_GLIDE_MS = 380;
const OCR_MAX_GLIDE_MS = 750;
const OCR_RECONNECT_GAP_MS = 1_500;
/** A step no walk explains: a teleport, a loaded save or a debug jump. */
const SNAP_WORLD_DISTANCE = 96;
const POSITION_EPSILON = 0.000_001;

interface Glide {
  from: LiveMotionPosition;
  to: LiveMotionPosition;
  startedAt: number;
  duration: number;
}

const listeners = new Set<LiveMotionListener>();
let latestSample: LivePosition | null = null;
let current: LiveMotionPosition | null = null;
let glide: Glide | null = null;
let ocrGlideMs = OCR_DEFAULT_GLIDE_MS;
let lastPositionChangeAt = 0;
let feedAttached = false;
let motionTimer: number | null = null;

const samePoint = (left: LiveMotionPosition, right: LiveMotionPosition) =>
  Math.abs(left.x - right.x) <= POSITION_EPSILON
  && Math.abs(left.y - right.y) <= POSITION_EPSILON;

const positionAt = ({ from, to, startedAt, duration }: Glide, now: number): LiveMotionPosition => {
  const progress = (now - startedAt) / duration;
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
};

const publishMotion = (position: LiveMotionPosition | null) => {
  for (const listener of listeners) listener(position);
};

const stopTimer = () => {
  if (motionTimer === null) return;
  window.clearInterval(motionTimer);
  motionTimer = null;
};

const advance = () => {
  if (!glide) return;
  const next = positionAt(glide, performance.now());
  if (next === glide.to) {
    glide = null;
    stopTimer();
  }
  if (next === current) return;
  current = next;
  publishMotion(next);
};

const startTimer = () => {
  if (!glide || motionTimer !== null || listeners.size === 0 || document.visibilityState === "hidden") return;
  motionTimer = window.setInterval(advance, LIVE_MOTION_TICK_MS);
};

const snap = (point: LiveMotionPosition | null) => {
  glide = null;
  stopTimer();
  current = point;
  publishMotion(point);
};

const acceptSample = (sample: LivePosition | null) => {
  const previous = latestSample;
  latestSample = sample;
  if (!sample) {
    ocrGlideMs = OCR_DEFAULT_GLIDE_MS;
    lastPositionChangeAt = 0;
    snap(null);
    return;
  }

  const next = { x: sample.x, y: sample.y };
  if (previous?.source !== sample.source) {
    ocrGlideMs = OCR_DEFAULT_GLIDE_MS;
    lastPositionChangeAt = sample.receivedAt;
  }

  if (!current || !previous || previous.mapId !== sample.mapId
    || Math.hypot(next.x - previous.x, next.y - previous.y) > SNAP_WORLD_DISTANCE) {
    ocrGlideMs = OCR_DEFAULT_GLIDE_MS;
    lastPositionChangeAt = sample.receivedAt;
    snap(next);
    return;
  }

  // A scan can repeat the same coordinates before the addon's next refresh.
  if (samePoint(glide?.to ?? current, next)) return;
  if (sample.source === "ocr") {
    const interval = sample.receivedAt - lastPositionChangeAt;
    if (interval > OCR_RECONNECT_GAP_MS) {
      ocrGlideMs = OCR_DEFAULT_GLIDE_MS;
    } else if (interval > 0) {
      const duration = Math.min(OCR_MAX_GLIDE_MS, Math.max(OCR_MIN_GLIDE_MS, interval));
      // Keep a short interval from ending the next glide early when reads alternate in length.
      ocrGlideMs = Math.max(duration, ocrGlideMs + (duration - ocrGlideMs) * 0.2);
    }
  }
  lastPositionChangeAt = sample.receivedAt;
  const now = performance.now();
  const from = glide ? positionAt(glide, now) : current;
  glide = { from, to: next, startedAt: now, duration: sample.source === "ocr" ? ocrGlideMs : LIVE_MOTION_GLIDE_MS };
  startTimer();
};

const attachFeed = () => {
  if (feedAttached) return;
  feedAttached = true;
  acceptSample(getLatestLivePosition());
  subscribeLivePosition(acceptSample);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopTimer();
    } else if (listeners.size > 0) {
      advance();
      startTimer();
    }
  });
};

/** Read the exact visual point that new consumers should start from. */
export const getLatestLiveMotionPosition = (): LiveMotionPosition | null => {
  attachFeed();
  return glide ? positionAt(glide, performance.now()) : current;
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
    if (listeners.size === 0) stopTimer();
  };
};
