import { GAME_JOURNEY, GAME_TELEMETRY } from "../../game-config.ts";
import { deleteCompletedJourney, emptyJourneyData, emptyJourneyPreferences, parseJourneyData, parseJourneyPreferences,
  type JourneyCaptureRules, type JourneyData, type JourneyPreferences } from "./journey-state.ts";

export type JourneyStorageError = "storage-unavailable" | "invalid-data";
export interface JourneyRead {
  preferences: JourneyPreferences;
  data: JourneyData;
  error: JourneyStorageError | null;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const JOURNEY_CAPTURE_RULES: JourneyCaptureRules = {
  coordinateLimit: GAME_TELEMETRY.coordinateLimit,
  sampleIntervalMs: GAME_JOURNEY.sampleIntervalMs,
  gapAfterMs: GAME_JOURNEY.gapAfterMs,
  minimumDistance: GAME_JOURNEY.minimumDistance,
  teleportDistance: GAME_JOURNEY.teleportDistance,
  teleportSpeed: GAME_JOURNEY.teleportSpeed,
  maxPoints: GAME_JOURNEY.maxPoints,
  maxSegments: GAME_JOURNEY.maxSegments,
};
export const JOURNEY_CHANGE_EVENT = `${GAME_JOURNEY.storagePrefix}:changed`;

const safeWorldId = (worldId: string) => {
  if (!worldId || worldId.length > 512) throw new Error("Invalid journey world id");
  return encodeURIComponent(worldId);
};

export const createJourneyStorage = ({ storage, events, prefix = GAME_JOURNEY.storagePrefix,
  maxStoredBytes = GAME_JOURNEY.maxStoredBytes, now = Date.now }: {
  storage: KeyValueStorage; events?: EventTarget; prefix?: string; maxStoredBytes?: number; now?: () => number;
}) => {
  if (!prefix || !Number.isSafeInteger(maxStoredBytes) || maxStoredBytes < 1024) throw new Error("Invalid journey storage configuration");
  const keys = (worldId: string) => {
    const suffix = safeWorldId(worldId);
    return { preferences: `${prefix}:preferences:${suffix}`, data: `${prefix}:data:${suffix}` };
  };
  const changedEvent = `${prefix}:changed`;
  const decode = <T>(raw: string | null, fallback: T, parse: (value: unknown) => T): T => {
    if (raw === null) return fallback;
    if (raw.length > maxStoredBytes) throw new Error("Journey storage record is oversized");
    return parse(JSON.parse(raw) as unknown);
  };
  const read = (worldId: string): JourneyRead => {
    const at = now(), names = keys(worldId);
    try {
      const preferences = decode(storage.getItem(names.preferences), emptyJourneyPreferences(worldId, at),
        value => parseJourneyPreferences(value, worldId));
      let data = decode(storage.getItem(names.data), emptyJourneyData(worldId, preferences.clearRevision, at),
        value => parseJourneyData(value, worldId, JOURNEY_CAPTURE_RULES));
      if (data.clearRevision !== preferences.clearRevision) data = emptyJourneyData(worldId, preferences.clearRevision, at);
      return { preferences, data, error: null };
    } catch (error) {
      const unavailable = error instanceof DOMException && ["SecurityError", "QuotaExceededError"].includes(error.name);
      return { preferences: emptyJourneyPreferences(worldId, at), data: emptyJourneyData(worldId, 0, at),
        error: unavailable ? "storage-unavailable" : "invalid-data" };
    }
  };
  const notify = () => events?.dispatchEvent(new Event(changedEvent));
  const writePreferences = (preferences: JourneyPreferences) => {
    const value = parseJourneyPreferences(preferences, preferences.worldId), raw = JSON.stringify(value);
    if (raw.length > maxStoredBytes) throw new Error("Journey preferences are oversized");
    storage.setItem(keys(value.worldId).preferences, raw); notify(); return value;
  };
  const writeData = (data: JourneyData) => {
    const value = parseJourneyData(data, data.worldId, JOURNEY_CAPTURE_RULES), raw = JSON.stringify(value);
    if (raw.length > maxStoredBytes) throw new Error("Journey data is oversized");
    storage.setItem(keys(value.worldId).data, raw); notify(); return value;
  };
  return {
    read,
    storedFields(worldId: string) {
      const names = keys(worldId);
      return { preferences: storage.getItem(names.preferences) !== null,
        data: storage.getItem(names.data) !== null };
    },
    replace(worldId: string, snapshot: Pick<JourneyRead, "preferences" | "data">) {
      const preferences = parseJourneyPreferences(snapshot.preferences, worldId);
      const data = parseJourneyData(snapshot.data, worldId, JOURNEY_CAPTURE_RULES);
      if (data.clearRevision !== preferences.clearRevision) throw new Error("Journey clear revision does not match preferences");
      const preferencesRaw = JSON.stringify(preferences), dataRaw = JSON.stringify(data);
      if (preferencesRaw.length > maxStoredBytes || dataRaw.length > maxStoredBytes) {
        throw new Error("Journey progress is oversized");
      }
      const names = keys(worldId);
      const priorData = storage.getItem(names.data), priorPreferences = storage.getItem(names.preferences);
      try {
        storage.setItem(names.data, dataRaw);
        storage.setItem(names.preferences, preferencesRaw);
      } catch (error) {
        try {
          if (priorData === null) storage.removeItem(names.data);
          else storage.setItem(names.data, priorData);
          if (priorPreferences === null) storage.removeItem(names.preferences);
          else storage.setItem(names.preferences, priorPreferences);
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "Journey progress could not be restored after a failed write");
        }
        throw error;
      }
      notify();
    },
    writeData,
    deleteJourney(worldId: string, journeyId: string) {
      const current = read(worldId);
      if (current.error) throw new Error("Journey data could not be read");
      const next = deleteCompletedJourney(current.data, journeyId, now());
      if (next === current.data) return false;
      writeData(next);
      return true;
    },
    setEnabled(worldId: string, enabled: boolean) {
      const current = read(worldId); if (current.error) throw new Error("Journey preferences could not be read");
      return writePreferences({ ...current.preferences, enabled, updatedAt: now() });
    },
    setVisible(worldId: string, visible: boolean) {
      const current = read(worldId); if (current.error) throw new Error("Journey preferences could not be read");
      return writePreferences({ ...current.preferences, visible, updatedAt: now() });
    },
    clear(worldId: string) {
      const current = read(worldId); if (current.error) throw new Error("Journey preferences could not be read");
      return writePreferences({ ...current.preferences, visible: true,
        clearRevision: current.preferences.clearRevision + 1, updatedAt: now() });
    },
    remove(worldId: string) {
      const names = keys(worldId); storage.removeItem(names.preferences); storage.removeItem(names.data); notify();
    },
    subscribe(worldId: string, listener: () => void) {
      if (!events) return () => undefined;
      const names = keys(worldId);
      const receive = (event: Event) => {
        const key = "key" in event ? (event as Event & { key?: string | null }).key : null;
        if (event.type === changedEvent || key === null || key === names.preferences || key === names.data) listener();
      };
      events.addEventListener(changedEvent, receive); events.addEventListener("storage", receive);
      return () => { events.removeEventListener(changedEvent, receive); events.removeEventListener("storage", receive); };
    },
  };
};

let browserStorage: ReturnType<typeof createJourneyStorage> | null = null;
export const getBrowserJourneyStorage = () => browserStorage ??= createJourneyStorage({ storage: localStorage, events: window });
