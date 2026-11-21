import { useEffect, useMemo, useRef, useState } from "react";
import { recordLivePositionSample, recordWork } from "./live-position-diagnostics";
import type { LivePosition, LivePositionState, LivePositionStatus } from "./live-position-types";

export const LIVE_POSITION_STORAGE_KEY = "pzim:live-position";
/** Same-window notification that the stored position changed (the `storage`
 *  event only reaches OTHER windows, so the publishing window needs this one). */
export const LIVE_POSITION_EVENT = "pzim:live-position-changed";
const LIVE_THRESHOLD_MS = 3_000;
/**
 * How often the position may reach React state. Every sample reaches the feed
 * below; component state (which re-renders the whole map workspace) only needs
 * to know roughly where the player is — the marker and the follow camera read
 * the feed directly. Without this cap a walking player re-rendered the
 * workspace twenty times a second, which is what made the marker stutter.
 */
const STATE_UPDATE_MS = 1_000;

const isFiniteCoordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;

/** Facing is optional: a Bridge build that predates it stores no dx/dy. */
const readFacingComponent = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1.001
    ? value
    : 0;

const parseLivePosition = (value: string | null): LivePosition | null => {
  if (!value) return null;

  try {
    const position = JSON.parse(value) as Partial<LivePosition>;
    return position.version === 1
      && typeof position.sequence === "number"
      && Number.isFinite(position.sequence)
      && isFiniteCoordinate(position.x)
      && isFiniteCoordinate(position.y)
      && typeof position.z === "number"
      && Number.isFinite(position.z)
      && Math.abs(position.z) <= 32
      && typeof position.receivedAt === "number"
      && Number.isFinite(position.receivedAt)
      ? {
        ...position,
        dx: readFacingComponent(position.dx),
        dy: readFacingComponent(position.dy),
        // A position stored by an older build carries no Bridge clock. Falling
        // back to arrival keeps it usable; it only costs the even spacing the
        // camera wants, which that build did not have either.
        updatedAt: typeof position.updatedAt === "number" && Number.isFinite(position.updatedAt)
          ? position.updatedAt
          : position.receivedAt,
      } as LivePosition
      : null;
  } catch {
    return null;
  }
};

export const readLivePosition = () => parseLivePosition(
  localStorage.getItem(LIVE_POSITION_STORAGE_KEY),
);

export const publishLivePosition = (position: LivePosition) => {
  localStorage.setItem(LIVE_POSITION_STORAGE_KEY, JSON.stringify(position));
  window.dispatchEvent(new Event(LIVE_POSITION_EVENT));
};

export const clearLivePosition = () => {
  localStorage.removeItem(LIVE_POSITION_STORAGE_KEY);
  window.dispatchEvent(new Event(LIVE_POSITION_EVENT));
};

/* ──────────────────────────────────────────────────────────────────────────
 * The sample feed
 *
 * localStorage is the durable snapshot between windows, but it must not be the
 * hot render path:
 * every consumer parsing the JSON and calling setState per sample re-rendered
 * the entire map twenty times a second, and the marker moved in visible steps
 * because it only ever saw whole samples.
 *
 * BroadcastChannel samples and the storage fallback are fanned out here to
 * subscribers that write straight to the DOM (the marker) or move the camera
 * (follow mode). Nothing in this hot path touches React.
 * ──────────────────────────────────────────────────────────────────────── */

type LivePositionListener = (position: LivePosition | null) => void;

const listeners = new Set<LivePositionListener>();
let latest: LivePosition | null = null;
let feedAttached = false;

/** A game session's sequences only ever count up, so a bigger gap than this
 *  going backwards is a new session rather than a straggler. */
const SESSION_RESTART_GAP_MS = 2_000;

/** How long the low-latency channel (or compatibility reader) owns the feed.
 *  The localStorage snapshot takes over if that source stops. */
const LOCAL_SOURCE_TTL_MS = 1_000;

let localSourceAt = 0;

const publishSample = (next: LivePosition | null) => {
  if (next && latest) {
    // Sequences are assigned by the Bridge and only ever increase, so anything
    // not NEWER than what is already out is a duplicate or a straggler — and a
    // straggler is worse than nothing. The track it feeds interpolates between
    // consecutive samples, so a coordinate arriving out of order walks the
    // marker (and, in follow mode, the whole map) back to where the player was
    // two samples ago and then forward again: the jump between two spots that
    // reads as the marker teleporting rather than gliding.
    const restarted = next.sequence < latest.sequence
      && next.updatedAt > latest.updatedAt + SESSION_RESTART_GAP_MS;
    if (!restarted && next.sequence <= latest.sequence) return;
  }
  latest = next;
  if (next) recordLivePositionSample(next);
  for (const listener of listeners) listener(next);
};

/**
 * A low-latency sample delivered by BroadcastChannel, or by the direct-reader
 * compatibility fallback. It reaches subscribers without a localStorage round
 * trip and without high-frequency IO in a modern map window.
 */
export const publishLivePositionSample = (position: LivePosition | null) => {
  localSourceAt = Date.now();
  publishSample(position);
};

/**
 * The shared snapshot changed. While a low-latency source is healthy this is
 * the same sample arriving later, so it is ignored. It becomes the fallback if
 * the channel or compatibility reader stops.
 */
const onStoredPositionChanged = (event: Event) => {
  if (event instanceof StorageEvent
    && event.key !== LIVE_POSITION_STORAGE_KEY
    && event.key !== null) return;
  // The gate comes FIRST, before the storage is touched at all. Reading a key
  // another process is writing is not free — parsing what we then throw away
  // cost this window tens of milliseconds per event, at the rate the Bridge
  // writes, which is most of a main thread.
  if (Date.now() - localSourceAt < LOCAL_SOURCE_TTL_MS) return;
  recordWork("relay", () => publishSample(readLivePosition()));
};

const attachFeed = () => {
  if (feedAttached || typeof window === "undefined") return;
  feedAttached = true;
  latest = readLivePosition();
  window.addEventListener("storage", onStoredPositionChanged);
  window.addEventListener(LIVE_POSITION_EVENT, onStoredPositionChanged);
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
  // What state currently holds, readable from the subscription without making
  // the effect depend on (and so re-subscribe for) every published sample.
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
    // It re-renders only when that verdict actually CHANGES, though. Ticking
    // unconditionally re-rendered every consumer once a second, and the biggest
    // consumer is the map: a second's worth of nothing became a re-projection
    // of every marker and a fresh town-label layout, once a second, forever.
    const timer = window.setInterval(() => {
      const current = publishedRef.current;
      const status = !current
        ? "disconnected"
        : Date.now() - current.receivedAt <= LIVE_THRESHOLD_MS ? "live" : "stale";
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
    if (age <= LIVE_THRESHOLD_MS) return { position, status: "live" };
    // Project Zomboid stops OnTick updates while paused. Keep the last known
    // coordinate visible in its existing stale style until the game actually
    // exits, at which point the background controller clears this store.
    return { position, status: "stale" };
  }, [now, position]);
};
