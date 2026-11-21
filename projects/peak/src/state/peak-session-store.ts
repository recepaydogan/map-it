import { useSyncExternalStore } from "react";

export type PeakScene = "main_menu" | "airport" | "ingame";
export type PeakGameMode = "offline" | "host";
export type PeakIntegrationStatus =
  | "unavailable"
  | "registering"
  | "ready"
  | "degraded";

export interface PeakSessionState {
  integrationStatus: PeakIntegrationStatus;
  supportedFeatures: string[];
  isGameRunning: boolean;
  /** Stable identity for the current PEAK process lifetime. */
  gameStartedAt: number | null;
  scene: PeakScene | null;
  gameMode: PeakGameMode | null;
  partySize: number | null;
  matchActive: boolean;
  matchStartedAt: number | null;
  /** Time of the first bridge sample accepted for the current climb. */
  climbStartedAt: number | null;
  deaths: number;
  teammateDeaths: number;
  checkpoints: number;
  trackingStatus: "ready" | "restart-required" | "pending" | "unavailable" | "failed" | null;
  trackingRestartGameId: string | null;
  lastEventAt: number | null;
  updatedAt: number;
  error: string | null;
}

const STORAGE_KEY = "peak-map:live-session";
const listeners = new Set<() => void>();

export const EMPTY_PEAK_SESSION: PeakSessionState = {
  integrationStatus: "unavailable",
  supportedFeatures: [],
  isGameRunning: false,
  gameStartedAt: null,
  scene: null,
  gameMode: null,
  partySize: null,
  matchActive: false,
  matchStartedAt: null,
  climbStartedAt: null,
  deaths: 0,
  teammateDeaths: 0,
  checkpoints: 0,
  trackingStatus: null,
  trackingRestartGameId: null,
  lastEventAt: null,
  updatedAt: 0,
  error: null,
};

const readSnapshot = (): PeakSessionState => {
  if (typeof window === "undefined") return EMPTY_PEAK_SESSION;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Merge over the defaults so snapshots stored by an older app version
    // still satisfy the current shape.
    return stored
      ? { ...EMPTY_PEAK_SESSION, ...(JSON.parse(stored) as Partial<PeakSessionState>) }
      : EMPTY_PEAK_SESSION;
  } catch {
    return EMPTY_PEAK_SESSION;
  }
};

let snapshot = readSnapshot();

const emitChange = (): void => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readSnapshot();
    emitChange();
  });
}

export const getPeakSession = (): PeakSessionState => snapshot;

export const updatePeakSession = (
  update: Partial<PeakSessionState> | ((current: PeakSessionState) => Partial<PeakSessionState>),
): PeakSessionState => {
  const patch = typeof update === "function" ? update(snapshot) : update;
  snapshot = { ...snapshot, ...patch, updatedAt: Date.now() };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  emitChange();
  return snapshot;
};

export const resetPeakSession = (): PeakSessionState => {
  snapshot = { ...EMPTY_PEAK_SESSION, updatedAt: Date.now() };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  emitChange();
  return snapshot;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePeakSession = (): PeakSessionState =>
  useSyncExternalStore(subscribe, getPeakSession, () => EMPTY_PEAK_SESSION);
