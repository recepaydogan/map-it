import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIVE_POSITION_STALE_AFTER_MS,
  type LivePartyPositionSnapshot,
  type LivePartyPositionState,
  type LivePosition,
  type LivePositionStatus,
} from "./live-position-types";
import { subscribeWindowResume } from "../../lib/window-resume";

export const LIVE_PARTY_POSITION_STORAGE_KEY = "gm:live-party-position";
export const LIVE_PARTY_POSITION_EVENT = "gm:live-party-position-changed";
const STATE_UPDATE_MS = 1_000;

const validCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const validPosition = (value: unknown): value is LivePosition => {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<LivePosition>;
  return position.version === 1
    && validCoordinate(position.sequence)
    && validCoordinate(position.x)
    && validCoordinate(position.y)
    && validCoordinate(position.dx)
    && validCoordinate(position.dy)
    && validCoordinate(position.updatedAt)
    && validCoordinate(position.receivedAt);
};

const parseSnapshot = (value: string | null): LivePartyPositionSnapshot | null => {
  if (!value) return null;
  try {
    const snapshot = JSON.parse(value) as Partial<LivePartyPositionSnapshot>;
    if (snapshot.version !== 1
      || !validCoordinate(snapshot.sequence)
      || !validCoordinate(snapshot.receivedAt)
      || (snapshot.primaryPlayerId !== null && typeof snapshot.primaryPlayerId !== "string")
      || !snapshot.players
      || typeof snapshot.players !== "object"
      || Array.isArray(snapshot.players)) return null;
    const players = Object.fromEntries(
      Object.entries(snapshot.players).filter((entry): entry is [string, LivePosition] => validPosition(entry[1])),
    );
    return {
      version: 1,
      sequence: snapshot.sequence,
      primaryPlayerId: snapshot.primaryPlayerId,
      players,
      receivedAt: snapshot.receivedAt,
    };
  } catch {
    return null;
  }
};

export const readLivePartyPosition = () => parseSnapshot(
  localStorage.getItem(LIVE_PARTY_POSITION_STORAGE_KEY),
);

export const publishLivePartyPosition = (snapshot: LivePartyPositionSnapshot) => {
  localStorage.setItem(LIVE_PARTY_POSITION_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new Event(LIVE_PARTY_POSITION_EVENT));
};

export const clearLivePartyPosition = () => {
  localStorage.removeItem(LIVE_PARTY_POSITION_STORAGE_KEY);
  window.dispatchEvent(new Event(LIVE_PARTY_POSITION_EVENT));
};

type Listener = (snapshot: LivePartyPositionSnapshot | null) => void;
const listeners = new Set<Listener>();
let latest: LivePartyPositionSnapshot | null = null;
let feedAttached = false;

const publishSnapshot = (next: LivePartyPositionSnapshot | null) => {
  if (next && latest && next.sequence <= latest.sequence && next.receivedAt <= latest.receivedAt) return;
  latest = next;
  for (const listener of listeners) listener(next);
};

const onStoredPositionChanged = (event: Event) => {
  if (event instanceof StorageEvent
    && event.key !== LIVE_PARTY_POSITION_STORAGE_KEY
    && event.key !== null) return;
  publishSnapshot(readLivePartyPosition());
};

const attachFeed = () => {
  if (feedAttached || typeof window === "undefined") return;
  feedAttached = true;
  latest = readLivePartyPosition();
  window.addEventListener("storage", onStoredPositionChanged);
  window.addEventListener(LIVE_PARTY_POSITION_EVENT, onStoredPositionChanged);
  subscribeWindowResume(() => publishSnapshot(readLivePartyPosition()));
};

export const getLatestLivePartyPosition = () => {
  attachFeed();
  return latest;
};

export const subscribeLivePartyPosition = (listener: Listener): (() => void) => {
  attachFeed();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useLivePartyPosition = (): LivePartyPositionState => {
  const [snapshot, setSnapshot] = useState<LivePartyPositionSnapshot | null>(getLatestLivePartyPosition);
  const [now, setNow] = useState(Date.now);
  const publishedRef = useRef(snapshot);
  const statusRef = useRef<LivePositionStatus>(snapshot ? "live" : "disconnected");
  const lastStateAtRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeLivePartyPosition((next) => {
      const roster = (value: LivePartyPositionSnapshot | null) => value
        ? `${value.primaryPlayerId ?? ""}:${Object.keys(value.players).sort().join(":")}`
        : "";
      const rosterChanged = roster(next) !== roster(publishedRef.current);
      const appeared = Boolean(next) !== Boolean(publishedRef.current);
      const at = performance.now();
      publishedRef.current = next;
      if (!appeared && !rosterChanged && at - lastStateAtRef.current < STATE_UPDATE_MS) return;
      lastStateAtRef.current = at;
      statusRef.current = next ? "live" : "disconnected";
      setSnapshot(next);
      setNow(Date.now());
    });
    const timer = window.setInterval(() => {
      const current = publishedRef.current;
      const status = !current
        ? "disconnected"
        : Date.now() - current.receivedAt <= LIVE_POSITION_STALE_AFTER_MS ? "live" : "stale";
      if (status === statusRef.current) return;
      statusRef.current = status;
      setSnapshot(current);
      setNow(Date.now());
    }, 1_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => {
    if (!snapshot) return { snapshot: null, status: "disconnected" };
    return {
      snapshot,
      status: now - snapshot.receivedAt <= LIVE_POSITION_STALE_AFTER_MS ? "live" : "stale",
    };
  }, [now, snapshot]);
};
