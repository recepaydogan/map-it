import { GAME_CONFIG } from "../../game-config";
import { createRecordedGameEvent, recordGameEvent } from "./game-event-recorder";
import { normalizeInfoUpdate, normalizeNewEvents } from "./game-event-normalizer";
import { createGameEventLivePositionPublisher } from "./game-event-live-position";
import {
  applyGameTrackerUpdate,
  EMPTY_GAME_TRACKER_STATE,
  publishGameTrackerState,
} from "./game-tracker-store";
import type { GameTrackerState } from "./game-event-types";

const MAX_FEATURE_ATTEMPTS = 5;
const FEATURE_RETRY_DELAY_MS = 3_000;

interface GameEventApiEvent<T = unknown> {
  addListener(listener: (payload: T) => void): void;
  removeListener(listener: (payload: T) => void): void;
}

interface GameEventApi {
  setRequiredFeatures(
    features: string[],
    callback: (result: { success: boolean; supportedFeatures?: string[]; error?: string }) => void,
  ): void;
  onInfoUpdates2: GameEventApiEvent;
  onNewEvents: GameEventApiEvent;
  onError: GameEventApiEvent;
}

const requiredFeatures = () => GAME_CONFIG.gameEventFeatures;

const setFeatures = (api: GameEventApi) => new Promise<{ success: boolean; supportedFeatures?: string[]; error?: string }>((resolve) => {
  api.setRequiredFeatures(requiredFeatures(), resolve);
});

export const startGameEventController = () => {
  const api = overwolf.games?.events as unknown as GameEventApi | undefined;
  if (!api) return () => {};
  const sessionId = crypto.randomUUID();
  let sequence = 0;
  let stopped = false;
  const livePositionPublisher = createGameEventLivePositionPublisher();
  let state: GameTrackerState = {
    ...EMPTY_GAME_TRACKER_STATE,
    sessionId,
    status: "connecting",
  };
  publishGameTrackerState(state);

  const record = (channel: "info" | "event" | "error" | "system", payload: unknown) => {
    sequence += 1;
    void recordGameEvent(createRecordedGameEvent(sessionId, sequence, channel, payload));
  };
  record("system", { type: "session-started", requiredFeatures: requiredFeatures() });
  const publishUpdate = (update: ReturnType<typeof normalizeInfoUpdate>) => {
    state = applyGameTrackerUpdate(state, update);
    publishGameTrackerState(state);
  };
  const onInfo = (payload: unknown) => {
    record("info", payload);
    const update = normalizeInfoUpdate(payload);
    publishUpdate(update);
    if (update.players !== undefined) {
      livePositionPublisher.publish(
        update.players,
        update.camera ?? state.camera,
        sequence,
        state.lastEventAt ?? Date.now(),
      );
    }
  };
  const onEvents = (payload: unknown) => {
    record("event", payload);
    const update = normalizeNewEvents(payload);
    publishUpdate(update);
    if (update.matchState === "ended") livePositionPublisher.clear();
  };
  const onError = (payload: unknown) => {
    record("error", payload);
    state = { ...state, status: "error", error: JSON.stringify(payload), lastEventAt: Date.now() };
    publishGameTrackerState(state);
  };
  api.onInfoUpdates2.addListener(onInfo);
  api.onNewEvents.addListener(onEvents);
  api.onError.addListener(onError);

  void (async () => {
    for (let attempt = 1; attempt <= MAX_FEATURE_ATTEMPTS && !stopped; attempt += 1) {
      const result = await setFeatures(api);
      record("system", { type: "required-features", attempt, result });
      if (result.success) {
        state = {
          ...state,
          status: "listening",
          supportedFeatures: result.supportedFeatures ?? [],
          error: null,
        };
        publishGameTrackerState(state);
        return;
      }
      if (attempt < MAX_FEATURE_ATTEMPTS) {
        await new Promise((resolve) => window.setTimeout(resolve, FEATURE_RETRY_DELAY_MS));
      }
    }
    if (stopped) return;
    state = { ...state, status: "error", error: "Required game-event features could not be registered." };
    publishGameTrackerState(state);
  })();

  return () => {
    stopped = true;
    api.onInfoUpdates2.removeListener(onInfo);
    api.onNewEvents.removeListener(onEvents);
    api.onError.removeListener(onError);
    livePositionPublisher.clear();
    record("system", { type: "session-ended" });
    publishGameTrackerState({ ...state, status: "disconnected" });
  };
};
