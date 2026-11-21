import { GAME_JOURNEY } from "../../game-config.ts";
import {
  parseJourneyData,
  parseJourneyPreferences,
  type JourneyData,
  type JourneyPreferences,
  type WorldJourney,
} from "../../features/journey/journey-state.ts";
import { JOURNEY_CAPTURE_RULES } from "../../features/journey/journey-storage.ts";

export interface JourneyProgress {
  preferences: JourneyPreferences;
  data: JourneyData;
}

const lastPointAt = (journey: WorldJourney): number =>
  journey.segments.at(-1)!.points.at(-1)!.at;

const journeyVersion = (journey: WorldJourney): number =>
  Math.max(lastPointAt(journey), journey.endedAt ?? 0);

const completed = (journey: WorldJourney): WorldJourney => ({
  ...journey,
  endedAt: lastPointAt(journey),
  endReason: "session-ended",
  pendingBreak: false,
});

export const parseJourneyProgress = (value: unknown, worldId: string): JourneyProgress => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid journey progress");
  }
  const input = value as Record<string, unknown>;
  const preferences = parseJourneyPreferences(input.preferences, worldId);
  const data = parseJourneyData(input.data, worldId, JOURNEY_CAPTURE_RULES);
  if (data.clearRevision !== preferences.clearRevision) {
    throw new Error("Journey clear revision does not match preferences");
  }
  return { preferences, data };
};

export const sameJourneyProgress = (left: JourneyProgress, right: JourneyProgress): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Anonymous routes belong to the newly signed-in account's current clear epoch. */
export const adoptGuestJourneyProgress = (local: JourneyProgress, remote: JourneyProgress,
  preferencesStored: boolean): JourneyProgress => parseJourneyProgress({
    preferences: preferencesStored
      ? { ...local.preferences, clearRevision: remote.preferences.clearRevision }
      : remote.preferences,
    data: { ...local.data, clearRevision: remote.data.clearRevision },
  }, local.data.worldId);

/** Preserve every retained route point; a later clear supersedes older history. */
export const mergeJourneyProgress = (local: JourneyProgress, remote: JourneyProgress): JourneyProgress => {
  const worldId = local.data.worldId;
  if (worldId !== remote.data.worldId) throw new Error("Cannot merge journeys from different worlds");
  if (local.data.clearRevision !== remote.data.clearRevision) {
    return local.data.clearRevision > remote.data.clearRevision ? local : remote;
  }

  const preferences = local.preferences.updatedAt >= remote.preferences.updatedAt
    ? local.preferences : remote.preferences;
  const deletedJourneyIds = [...new Set([...local.data.deletedJourneyIds, ...remote.data.deletedJourneyIds])].sort();
  const deleted = new Set(deletedJourneyIds);
  const byId = new Map<string, WorldJourney>();
  const add = (journey: WorldJourney) => {
    if (deleted.has(journey.id)) return;
    const prior = byId.get(journey.id);
    if (!prior || journeyVersion(journey) >= journeyVersion(prior)) byId.set(journey.id, journey);
  };
  for (const journey of remote.data.journeys) add(journey);
  for (const journey of local.data.journeys) add(journey);

  const activeCandidates = [remote.data.active, local.data.active].filter(
    (journey): journey is WorldJourney => journey !== null && !deleted.has(journey.id),
  );
  activeCandidates.sort((left, right) => journeyVersion(right) - journeyVersion(left));
  let active: WorldJourney | null = activeCandidates[0] ?? null;
  for (const journey of activeCandidates.slice(1)) add(completed(journey));
  if (active && byId.has(active.id)) {
    const archived = byId.get(active.id)!;
    if (journeyVersion(archived) >= journeyVersion(active)) {
      active = null;
    } else {
      byId.delete(active.id);
    }
  }
  const journeys = [...byId.values()].sort((left, right) => right.endedAt! - left.endedAt!)
    .slice(0, GAME_JOURNEY.maxJourneys);
  const data: JourneyData = { ...local.data, active, journeys, deletedJourneyIds,
    updatedAt: Math.max(local.data.updatedAt, remote.data.updatedAt) };
  const cloudLimit = GAME_JOURNEY.maxStoredBytes - 4_096;
  while (journeys.length > 0 && JSON.stringify(data).length > cloudLimit) {
    journeys.pop();
  }
  if (JSON.stringify(data).length > cloudLimit) {
    throw new Error("Merged journey progress is oversized");
  }
  return parseJourneyProgress({
    preferences,
    data,
  }, worldId);
};
