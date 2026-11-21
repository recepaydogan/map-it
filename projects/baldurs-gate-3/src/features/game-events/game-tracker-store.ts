import { useEffect, useState } from "react";
import { subscribeWindowResume } from "../../lib/window-resume";
import type { GameTrackerState, NormalizedGameUpdate } from "./game-event-types";

export const GAME_TRACKER_STORAGE_KEY = "gm:game-tracker-state";
export const GAME_TRACKER_EVENT = "gm:game-tracker-state-changed";

export const EMPTY_GAME_TRACKER_STATE: GameTrackerState = {
  version: 1,
  sessionId: null,
  status: "disconnected",
  scene: null,
  mainMap: null,
  subMap: null,
  camera: null,
  players: {},
  matchState: null,
  supportedFeatures: [],
  lastEventAt: null,
  error: null,
};

export const readGameTrackerState = (): GameTrackerState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(GAME_TRACKER_STORAGE_KEY) ?? "null") as Partial<GameTrackerState> | null;
    if (!parsed || parsed.version !== 1) return EMPTY_GAME_TRACKER_STATE;
    return { ...EMPTY_GAME_TRACKER_STATE, ...parsed };
  } catch {
    return EMPTY_GAME_TRACKER_STATE;
  }
};

export const publishGameTrackerState = (state: GameTrackerState) => {
  localStorage.setItem(GAME_TRACKER_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(GAME_TRACKER_EVENT));
};

export const applyGameTrackerUpdate = (
  current: GameTrackerState,
  update: NormalizedGameUpdate,
  receivedAt = Date.now(),
): GameTrackerState => ({
  ...current,
  ...(update.scene !== undefined ? { scene: update.scene } : {}),
  ...(update.mainMap !== undefined ? { mainMap: update.mainMap } : {}),
  ...(update.subMap !== undefined ? { subMap: update.subMap } : {}),
  ...(update.camera !== undefined ? { camera: update.camera } : {}),
  ...(update.players !== undefined ? { players: { ...current.players, ...update.players } } : {}),
  ...(update.matchState !== undefined ? { matchState: update.matchState } : {}),
  status: "listening",
  lastEventAt: receivedAt,
  error: null,
});

export const useGameTrackerState = () => {
  const [state, setState] = useState(readGameTrackerState);
  useEffect(() => {
    const update = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== GAME_TRACKER_STORAGE_KEY && event.key !== null) return;
      setState(readGameTrackerState());
    };
    window.addEventListener("storage", update);
    window.addEventListener(GAME_TRACKER_EVENT, update);
    const unsubscribeResume = subscribeWindowResume(() => setState(readGameTrackerState()));
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(GAME_TRACKER_EVENT, update);
      unsubscribeResume();
    };
  }, []);
  return state;
};
