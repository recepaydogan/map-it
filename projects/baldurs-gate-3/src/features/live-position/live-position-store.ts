import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIVE_POSITION_STALE_AFTER_MS,
  type LivePosition,
  type LivePositionState,
  type LivePositionStatus,
} from "./live-position-types";
import { subscribeWindowResume } from "../../lib/window-resume";

/**
 * The live-position store: the one place a game-specific reader publishes
 * to, and the one place the map reads from.
 *
 * Publishing writes the sample to localStorage (the durable snapshot every
 * window of the extension shares) and fans it out to in-window subscribers.
 * A reader usually runs in the BACKGROUND window — it is the only window
 * alive for the whole session — and the map windows pick the samples up
 * through the `storage` event. Call `clearLivePosition` when the game exits.
 */
export const LIVE_POSITION_STORAGE_KEY = "gm:live-position";
/** Same-window notification that the stored position changed (the `storage`
 *  event only reaches OTHER windows, so the publishing window needs this one). */
export const LIVE_POSITION_EVENT = "gm:live-position-changed";
/**
 * How often the position may reach React state. Every sample reaches the feed
 * below; component state (which re-renders the whole map workspace) only needs
 * to know roughly where the player is — the marker and the follow camera read
 * the feed directly.
 */
const STATE_UPDATE_MS = 1_000;

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;

const readFacingComponent = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1.001
    ? value
    : 0;

const parseLivePosition = (value: string | null): LivePosition | null => {
  if (!value) return null;

  try {
    const position = JSON.parse(value) as Partial<LivePosition>;
    if (position.version !== 1
      || typeof position.sequence !== "number"
      || !Number.isFinite(position.sequence)
      || !isFiniteCoordinate(position.x)
      || !isFiniteCoordinate(position.y)
      || typeof position.receivedAt !== "number"
      || !Number.isFinite(position.receivedAt)) return null;
    return {
      version: 1,
      sequence: position.sequence,
      x: position.x,
      y: position.y,
      ...(typeof position.z === "number" && Number.isFinite(position.z) ? { z: position.z } : {}),
      dx: readFacingComponent(position.dx),
      dy: readFacingComponent(position.dy),
      updatedAt: typeof position.updatedAt === "number" && Number.isFinite(position.updatedAt)
        ? position.updatedAt
        : position.receivedAt,
      receivedAt: position.receivedAt,
    };
  } catch {
    return null;
  }
};

export const readLivePosition = () => parseLivePosition(
  localStorage.getItem(LIVE_POSITION_STORAGE_KEY),
);

/** Store a sample for every window. Called by the game-specific reader. */
export const publishLivePosition = (position: LivePosition) => {
  localStorage.setItem(LIVE_POSITION_STORAGE_KEY, JSON.stringify(position));
  window.dispatchEvent(new Event(LIVE_POSITION_EVENT));
};

/** Forget the player — the game exited or the source went away. */
export const clearLivePosition = () => {
  localStorage.removeItem(LIVE_POSITION_STORAGE_KEY);
  window.dispatchEvent(new Event(LIVE_POSITION_EVENT));
};

/* ──────────────────────────────────────────────────────────────────────────
 * The sample feed
 *
 * localStorage is the durable snapshot between windows, but it must not be the
 * hot render path: every consumer parsing the JSON and calling setState per
 * sample would re-render the entire map many times a second. Samples are
 * fanned out here to subscribers that write straight to the DOM (the marker)
 * or move the camera (follow mode). Nothing in this hot path touches React.
 * ──────────────────────────────────────────────────────────────────────── */

type LivePositionListener = (position: LivePosition | null) => void;

const listeners = new Set<LivePositionListener>();
let latest: LivePosition | null = null;
let feedAttached = false;

/** A game session's sequences only ever count up, so a bigger gap than this
 *  going backwards is a new session rather than a straggler. */
const SESSION_RESTART_GAP_MS = 2_000;

const publishSample = (next: LivePosition | null) => {
  if (next && latest) {
    // Sequences only ever increase, so anything not NEWER than what is already
    // out is a duplicate or a straggler — and a straggler would walk the marker
    // back to where the player was two samples ago and then forward again.
    const restarted = next.sequence < latest.sequence
      && next.updatedAt > latest.updatedAt + SESSION_RESTART_GAP_MS;
    if (!restarted && next.sequence <= latest.sequence) return;
  }
  latest = next;
  for (const listener of listeners) listener(next);
};

/**
 * A sample delivered directly in this window (a reader running here, or a
 * low-latency channel). Reaches subscribers without a localStorage round trip.
 */
export const publishLivePositionSample = (position: LivePosition | null) => {
  publishSample(position);
};

const onStoredPositionChanged = (event: Event) => {
  if (event instanceof StorageEvent
    && event.key !== LIVE_POSITION_STORAGE_KEY
    && event.key !== null) return;
  publishSample(readLivePosition());
};

const attachFeed = () => {
  if (feedAttached || typeof window === "undefined") return;
  feedAttached = true;
  latest = readLivePosition();
  window.addEventListener("storage", onStoredPositionChanged);
  window.addEventListener(LIVE_POSITION_EVENT, onStoredPositionChanged);
  subscribeWindowResume(() => publishSample(readLivePosition()));
};

/** The most recent sample, for seeding a subscriber's first frame. */
export const getLatestLivePosition = (): LivePosition | null => {
  attachFeed();
  return latest;
};

/**
 * Every position sample, as it lands. For the hot consumers only — the player
 * marker and the follow camera. Everything else should use `useLivePosition`,
 * whose state is throttled.
 */
export const subscribeLivePosition = (listener: LivePositionListener): (() => void) => {
  attachFeed();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/**
 * The position as React state: throttled to STATE_UPDATE_MS, except for the
 * transitions a UI must not miss — the first sample, and losing or regaining
 * the player entirely.
 */
export const useLivePosition = (): LivePositionState => {
  const [position, setPosition] = useState<LivePosition | null>(getLatestLivePosition);
  const [now, setNow] = useState(Date.now);
  const publishedRef = useRef(position);
  /** The staleness verdict the timer below last acted on. */
  const statusRef = useRef<LivePositionStatus>("disconnected");
  const lastStateAtRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeLivePosition((next) => {
      const appeared = Boolean(next) !== Boolean(publishedRef.current);
      const at = performance.now();
      if (!appeared && at - lastStateAtRef.current < STATE_UPDATE_MS) return;
      lastStateAtRef.current = at;
      publishedRef.current = next;
      statusRef.current = next ? "live" : "disconnected";
      setPosition(next);
      setNow(Date.now());
    });
    // Staleness is a function of the clock, not of new samples: a paused game
    // stops writing, so only this timer can notice the position going stale.
    // It re-renders only when that verdict actually CHANGES.
    const timer = window.setInterval(() => {
      const current = publishedRef.current;
      const status = !current
        ? "disconnected"
        : Date.now() - current.receivedAt <= LIVE_POSITION_STALE_AFTER_MS ? "live" : "stale";
      if (status === statusRef.current) return;
      statusRef.current = status;
      setNow(Date.now());
    }, 1_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => {
    if (!position) return { position: null, status: "disconnected" };
    const age = Math.max(0, now - position.receivedAt);
    if (age <= LIVE_POSITION_STALE_AFTER_MS) return { position, status: "live" };
    // A paused game stops writing. Keep the last known coordinate visible in
    // its stale style until the reader clears the store.
    return { position, status: "stale" };
  }, [now, position]);
};
