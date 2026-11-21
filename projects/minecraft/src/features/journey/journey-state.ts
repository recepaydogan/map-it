export interface JourneyPoint {
  x: number;
  y: number;
  z: number;
  at: number;
  biome?: string;
}

export interface JourneySegment {
  dimension: string;
  points: JourneyPoint[];
}

export interface WorldJourney {
  id: string;
  worldId: string;
  sessionKey: string;
  startedAt: number;
  endedAt: number | null;
  endReason: "death" | "session-ended" | null;
  pendingBreak: boolean;
  truncated: boolean;
  segments: JourneySegment[];
}

export interface JourneyPreferences {
  schemaVersion: 2;
  worldId: string;
  enabled: boolean;
  visible: boolean;
  clearRevision: number;
  updatedAt: number;
}

export interface JourneyData {
  schemaVersion: 2;
  worldId: string;
  clearRevision: number;
  active: WorldJourney | null;
  journeys: WorldJourney[];
  deletedJourneyIds: string[];
  updatedAt: number;
}

export interface JourneyCaptureRules {
  coordinateLimit: number;
  sampleIntervalMs: number;
  gapAfterMs: number;
  minimumDistance: number;
  teleportDistance: number;
  teleportSpeed: number;
  maxPoints: number;
  maxSegments: number;
}

export interface JourneySample extends JourneyPoint {
  worldId: string;
  sessionKey: string;
  dimension: string;
  /** Preserve the final observed source position immediately before a dimension change. */
  force?: boolean;
}

const validText = (value: unknown, max = 1024): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const validTimestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const validCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
const validRules = (rules: JourneyCaptureRules) => [rules.coordinateLimit, rules.sampleIntervalMs, rules.gapAfterMs,
  rules.minimumDistance, rules.teleportDistance, rules.teleportSpeed, rules.maxPoints, rules.maxSegments]
  .every(value => Number.isFinite(value) && value > 0) && Number.isSafeInteger(rules.maxPoints) && Number.isSafeInteger(rules.maxSegments);

export const emptyJourneyPreferences = (worldId: string, at = 0): JourneyPreferences => ({
  schemaVersion: 2, worldId, enabled: true, visible: true, clearRevision: 0, updatedAt: at,
});

export const emptyJourneyData = (worldId: string, clearRevision = 0, at = 0): JourneyData => ({
  schemaVersion: 2, worldId, clearRevision, active: null, journeys: [], deletedJourneyIds: [], updatedAt: at,
});

const cloneJourney = (journey: WorldJourney): WorldJourney => ({ ...journey,
  segments: journey.segments.map(segment => ({ ...segment, points: segment.points.map(point => ({ ...point })) })),
});

const parseJourney = (value: unknown, worldId: string, rules: JourneyCaptureRules, active: boolean): WorldJourney => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid journey");
  const source = value as Record<string, unknown>;
  if (!validText(source.id, 256) || source.worldId !== worldId || !validText(source.sessionKey, 2048) ||
    !validTimestamp(source.startedAt) || !(source.endedAt === null || validTimestamp(source.endedAt)) ||
    active !== (source.endedAt === null) || typeof source.pendingBreak !== "boolean" || typeof source.truncated !== "boolean" ||
    !Array.isArray(source.segments) || source.segments.length < 1 || source.segments.length > rules.maxSegments)
    throw new Error("Invalid journey identity");
  let count = 0, previousAt = -1;
  const segments = source.segments.map(rawSegment => {
    if (!rawSegment || typeof rawSegment !== "object" || Array.isArray(rawSegment)) throw new Error("Invalid journey segment");
    const segment = rawSegment as Record<string, unknown>;
    if (!validText(segment.dimension, 256) || !Array.isArray(segment.points) || !segment.points.length)
      throw new Error("Invalid journey segment");
    const points = segment.points.map(rawPoint => {
      if (!rawPoint || typeof rawPoint !== "object" || Array.isArray(rawPoint)) throw new Error("Invalid journey point");
      const point = rawPoint as Record<string, unknown>;
      if (!validCoordinate(point.x, rules.coordinateLimit) || !validCoordinate(point.y, rules.coordinateLimit) ||
        !validCoordinate(point.z, rules.coordinateLimit) || !validTimestamp(point.at) || point.at <= previousAt)
        throw new Error("Invalid journey point");
      previousAt = point.at; count++;
      if (point.biome !== undefined && !validText(point.biome, 256)) throw new Error("Invalid journey biome");
      return { x: point.x, y: point.y, z: point.z, at: point.at,
        ...(typeof point.biome === "string" ? { biome: point.biome } : {}) };
    });
    return { dimension: segment.dimension, points };
  });
  if (count > rules.maxPoints || previousAt < Number(source.startedAt) || source.endedAt !== null && source.endedAt < previousAt)
    throw new Error("Invalid journey bounds");
  if (!active && source.pendingBreak) throw new Error("Invalid completed journey state");
  const endReason = active ? null : source.endReason === "death" ? "death" : "session-ended";
  return { id: source.id, worldId, sessionKey: source.sessionKey, startedAt: source.startedAt,
    endedAt: source.endedAt as number | null, endReason, pendingBreak: source.pendingBreak, truncated: source.truncated, segments };
};

export const parseJourneyPreferences = (value: unknown, worldId: string): JourneyPreferences => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid journey preferences");
  const source = value as Record<string, unknown>;
  if ((source.schemaVersion !== 1 && source.schemaVersion !== 2) || source.worldId !== worldId || typeof source.enabled !== "boolean" ||
    typeof source.visible !== "boolean" || !validTimestamp(source.clearRevision) || !validTimestamp(source.updatedAt))
    throw new Error("Invalid journey preferences");
  return { schemaVersion: 2, worldId, enabled: source.enabled,
    visible: source.schemaVersion === 1 ? true : source.visible,
    clearRevision: source.clearRevision, updatedAt: source.updatedAt };
};

export const parseJourneyData = (value: unknown, worldId: string, rules: JourneyCaptureRules): JourneyData => {
  if (!validRules(rules) || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid journey data");
  const source = value as Record<string, unknown>;
  if (![1, 2].includes(Number(source.schemaVersion)) || source.worldId !== worldId || !validTimestamp(source.clearRevision) || !validTimestamp(source.updatedAt))
    throw new Error("Invalid journey data");
  const active = source.active === null ? null : parseJourney(source.active, worldId, rules, true);
  const rawJourneys = source.schemaVersion === 1
    ? source.latest === null ? [] : [source.latest]
    : source.journeys;
  if (!Array.isArray(rawJourneys)) throw new Error("Invalid journey history");
  const journeys = rawJourneys.map(value => parseJourney(value, worldId, rules, false));
  if (new Set(journeys.map(journey => journey.id)).size !== journeys.length) throw new Error("Duplicate journey identity");
  const rawDeleted = source.deletedJourneyIds ?? [];
  if (!Array.isArray(rawDeleted) || rawDeleted.length > 10_000 || !rawDeleted.every(id => validText(id, 256)))
    throw new Error("Invalid deleted journey identities");
  const deletedJourneyIds = [...new Set(rawDeleted as string[])].sort();
  if (journeys.some(journey => deletedJourneyIds.includes(journey.id)) || active && deletedJourneyIds.includes(active.id))
    throw new Error("Deleted journey is still present");
  for (let index = 1; index < journeys.length; index++) {
    if (journeys[index - 1].endedAt! < journeys[index].endedAt!) throw new Error("Invalid journey history order");
  }
  const newestPoint = Math.max(active ? lastPoint(active).at : 0, journeys[0] ? lastPoint(journeys[0]).at : 0);
  if (source.updatedAt < newestPoint) throw new Error("Invalid journey update time");
  return { schemaVersion: 2, worldId, clearRevision: source.clearRevision, active, journeys,
    deletedJourneyIds, updatedAt: source.updatedAt };
};

function lastPoint(journey: WorldJourney) { return journey.segments.at(-1)!.points.at(-1)!; }
const distance = (left: JourneyPoint, right: JourneyPoint) => Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
const pointCount = (journey: WorldJourney) => journey.segments.reduce((sum, segment) => sum + segment.points.length, 0);

const trimJourney = (journey: WorldJourney, rules: JourneyCaptureRules): WorldJourney => {
  const next = cloneJourney(journey);
  while (next.segments.length > rules.maxSegments) { next.segments.shift(); next.truncated = true; }
  let count = pointCount(next);
  while (count > rules.maxPoints) {
    const first = next.segments[0];
    if (first.points.length === 1) next.segments.shift();
    else first.points.shift();
    count--; next.truncated = true;
  }
  return next;
};

export const finalizeJourney = (data: JourneyData, at: number, endReason: "death" | "session-ended" = "session-ended",
  maxJourneys = 100): JourneyData => {
  if (!data.active || !validTimestamp(at)) return data;
  const last = lastPoint(data.active), completed = cloneJourney(data.active);
  completed.endedAt = Math.max(last.at, at); completed.endReason = endReason; completed.pendingBreak = false;
  return { ...data, active: null, journeys: [completed, ...data.journeys].slice(0, maxJourneys), updatedAt: completed.endedAt };
};

export const deleteCompletedJourney = (data: JourneyData, id: string, at: number): JourneyData => {
  if (!validText(id, 256) || !validTimestamp(at) || !data.journeys.some(journey => journey.id === id)) return data;
  if (data.deletedJourneyIds.length >= 10_000) throw new Error("Too many deleted journey records");
  return { ...data, journeys: data.journeys.filter(journey => journey.id !== id),
    deletedJourneyIds: [...data.deletedJourneyIds, id].sort(), updatedAt: Math.max(data.updatedAt, at) };
};

export const interruptJourney = (data: JourneyData, at: number, terminal: boolean): JourneyData => {
  if (!data.active || !validTimestamp(at)) return data;
  if (terminal) return finalizeJourney(data, at);
  if (data.active.pendingBreak) return data;
  return { ...data, active: { ...cloneJourney(data.active), pendingBreak: true }, updatedAt: at };
};

export const captureJourneySample = (data: JourneyData, preferences: JourneyPreferences, sample: JourneySample,
  rules: JourneyCaptureRules, newId: () => string): JourneyData => {
  if (!validRules(rules) || data.worldId !== sample.worldId || preferences.worldId !== sample.worldId ||
    data.clearRevision !== preferences.clearRevision || !preferences.enabled || !validText(sample.sessionKey, 2048) ||
    !validText(sample.dimension, 256) || !validCoordinate(sample.x, rules.coordinateLimit) ||
    !validCoordinate(sample.y, rules.coordinateLimit) || !validCoordinate(sample.z, rules.coordinateLimit) || !validTimestamp(sample.at)) return data;
  let next = data;
  if (next.active && next.active.sessionKey !== sample.sessionKey) next = finalizeJourney(next, sample.at);
  if (!next.active) {
    const id = newId(); if (!validText(id, 256)) throw new Error("Invalid journey id");
    return { ...next, active: { id, worldId: sample.worldId, sessionKey: sample.sessionKey, startedAt: sample.at,
      endedAt: null, endReason: null, pendingBreak: false, truncated: false,
      segments: [{ dimension: sample.dimension, points: [{ x: sample.x, y: sample.y, z: sample.z, at: sample.at,
        ...(sample.biome ? { biome: sample.biome } : {}) }] }] }, updatedAt: sample.at };
  }
  const previous = lastPoint(next.active);
  if (sample.at <= previous.at) return next;
  const elapsed = sample.at - previous.at, travelled = distance(previous, sample);
  const discontinuity = next.active.pendingBreak || next.active.segments.at(-1)!.dimension !== sample.dimension ||
    elapsed > rules.gapAfterMs || travelled >= rules.teleportDistance && travelled / (elapsed / 1000) > rules.teleportSpeed;
  const biomeChanged = !!sample.biome && sample.biome !== previous.biome;
  if (!sample.force && !discontinuity && !biomeChanged
    && (elapsed < rules.sampleIntervalMs || travelled < rules.minimumDistance)) return next;
  const active = cloneJourney(next.active), point = { x: sample.x, y: sample.y, z: sample.z, at: sample.at,
    ...(sample.biome ? { biome: sample.biome } : {}) };
  if (discontinuity) active.segments.push({ dimension: sample.dimension, points: [point] });
  else active.segments.at(-1)!.points.push(point);
  active.pendingBreak = false;
  return { ...next, active: trimJourney(active, rules), updatedAt: sample.at };
};
