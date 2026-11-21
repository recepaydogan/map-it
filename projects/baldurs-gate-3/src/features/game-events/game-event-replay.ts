import { normalizeInfoUpdate, normalizeNewEvents } from "./game-event-normalizer.ts";
import { applyGameTrackerUpdate, EMPTY_GAME_TRACKER_STATE } from "./game-tracker-store.ts";
import type { GameTrackerState, RecordedGameEvent } from "./game-event-types";

/** Replays exported raw records through the same reducers as the live GEP controller. */
export const replayGameEventRecords = (
  records: RecordedGameEvent[],
  initialState: GameTrackerState = EMPTY_GAME_TRACKER_STATE,
): GameTrackerState => records
  .slice()
  .sort((left, right) => left.receivedAt - right.receivedAt || left.sequence - right.sequence)
  .reduce((state, record) => {
    if (record.channel === "info") {
      return applyGameTrackerUpdate(state, normalizeInfoUpdate(record.payload), record.receivedAt);
    }
    if (record.channel === "event") {
      return applyGameTrackerUpdate(state, normalizeNewEvents(record.payload), record.receivedAt);
    }
    return state;
  }, initialState);
