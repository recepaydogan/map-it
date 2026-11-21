import type { GameWorldPosition, NormalizedGameUpdate } from "./game-event-types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseData = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^(?:\[|\{|")/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
};

const normalizeKey = (value: string) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_");

const toPosition = (value: unknown): GameWorldPosition | null => {
  const parsed = parseData(value);
  if (!isRecord(parsed)) return null;
  const x = Number(parsed.x);
  const y = Number(parsed.y);
  const z = Number(parsed.z);
  return [x, y, z].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ? { x, y, z }
    : null;
};

const firstPosition = (value: unknown) => {
  const parsed = parseData(value);
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  return toPosition(candidate);
};

const playerPositions = (value: unknown) => {
  const parsed = parseData(value);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const players: Record<string, GameWorldPosition> = {};
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    for (const [key, positionValue] of Object.entries(entry)) {
      const position = toPosition(positionValue);
      if (position) players[key] = position;
    }
  }
  return players;
};

const applyInfoValue = (update: NormalizedGameUpdate, key: string, value: unknown) => {
  const normalizedKey = normalizeKey(key);
  const parsed = parseData(value);
  if (normalizedKey === "scene" && typeof parsed === "string") update.scene = parsed;
  if (normalizedKey === "main_map" && typeof parsed === "string") update.mainMap = parsed;
  if (normalizedKey === "sub_map" && typeof parsed === "string") update.subMap = parsed;
  if (normalizedKey === "location_camera") {
    const camera = firstPosition(parsed);
    if (camera) update.camera = camera;
  }
  if (normalizedKey === "location_players") update.players = playerPositions(parsed);
};

const visitInfo = (
  update: NormalizedGameUpdate,
  value: unknown,
  seen: Set<object>,
  depth: number,
) => {
  const parsed = parseData(value);
  if (!isRecord(parsed) || depth > 8 || seen.has(parsed)) return;
  seen.add(parsed);
  for (const [key, child] of Object.entries(parsed)) {
    applyInfoValue(update, key, child);
    const normalizedKey = normalizeKey(key);
    if (!["location_camera", "location_players"].includes(normalizedKey)) {
      visitInfo(update, child, seen, depth + 1);
    }
  }
};

/** Accepts both the nested native payload and the category/key/data sample shape. */
export const normalizeInfoUpdate = (payload: unknown): NormalizedGameUpdate => {
  const update: NormalizedGameUpdate = {};
  const parsed = parseData(payload);
  if (!isRecord(parsed)) return update;
  if (typeof parsed.key === "string") applyInfoValue(update, parsed.key, parsed.data);
  visitInfo(update, parsed.info ?? parsed, new Set<object>(), 0);
  return update;
};

export const normalizeNewEvents = (payload: unknown): NormalizedGameUpdate => {
  const parsed = parseData(payload);
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) return {};
  const names = parsed.events
    .filter(isRecord)
    .map((event) => event.name)
    .filter((name): name is string => typeof name === "string")
    .map(normalizeKey);
  if (names.includes("match_start")) return { matchState: "started" };
  if (names.includes("match_end")) return { matchState: "ended" };
  return {};
};
