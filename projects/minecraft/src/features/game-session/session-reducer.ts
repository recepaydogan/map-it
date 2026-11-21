import { asRecord, decodeRecord, getGepFields, readShortString } from "./gep-packet.ts";
import { emptySessionIdentity, type GameSession, type TelemetryRules } from "./session-types.ts";

const has = (value: object, key: string) => Object.hasOwn(value, key);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A world transition invalidates old coordinates before any next sample arrives. */
export const resetSessionWorld = (state: GameSession, inWorld: boolean): GameSession => ({
  ...state, generation: state.generation + 1, inWorld,
  identity: emptySessionIdentity(), position: null, dimension: null, biome: null,
  worldSeed: null, worldDisplayName: null, yaw: null, facingReceivedAt: null, pitch: null, issue: null,
  sceneKey: null,
  localWorldId: null,
  ...(state.positionReady === undefined ? {} : { positionReady: false }),
});

export const applyGepEvents = (state: GameSession, packet: unknown): GameSession => {
  const root = asRecord(packet);
  if (!root || !Array.isArray(root.events)) return state;
  let next = state;
  for (const event of root.events) {
    const entry = asRecord(event);
    if (entry?.name === "match_start") next = resetSessionWorld(next, true);
    if (entry?.name === "match_end") next = resetSessionWorld(next, false);
  }
  return next;
};

export const applyGepInfo = (
  state: GameSession, packet: unknown, now: number, rules: TelemetryRules,
): GameSession => {
  const fields = getGepFields(packet);
  if (!fields || !state.connected) return state;
  const { game, match } = fields;
  let next: GameSession = { ...state, identity: { ...state.identity } };

  const realm = has(match, "realms_info") ? decodeRecord(match.realms_info) : null;
  const identityUpdates = {
    ...(has(game, "world_id") ? { worldName: readShortString(game.world_id) } : {}),
    ...(has(match, "server") ? { server: readShortString(match.server) } : {}),
    ...(has(match, "realms_info") ? {
      realmId: realm && (typeof realm.realms_id === "string" || finite(realm.realms_id))
        ? String(realm.realms_id) : null,
      realmName: readShortString(realm?.realms_name),
    } : {}),
  };
  const becameRemote = !!state.identity.worldName && !state.identity.server && !state.identity.realmId
    && !!(identityUpdates.server || identityUpdates.realmId);
  const changedWorld = becameRemote || Object.entries(identityUpdates).some(([key, value]) => {
    const previous = state.identity[key as keyof typeof state.identity];
    return previous !== null && previous !== value;
  });
  if (changedWorld) next = resetSessionWorld(next, true);
  next.identity = { ...next.identity, ...identityUpdates };

  if (has(game, "mc_version")) next.gameVersion = readShortString(game.mc_version);
  if (has(game, "name")) next.playerName = readShortString(game.name);
  if (has(game, "scene_key")) next.sceneKey = readShortString(game.scene_key);
  if (has(match, "dimension")) {
    const rawDimension = readShortString(match.dimension);
    const dimension = rawDimension ? rules.dimensions[rawDimension] ?? rawDimension : null;
    if (dimension !== next.dimension) {
      if (next.positionReady !== undefined && next.dimension !== null) next.positionReady = false;
      next.position = null;
      next.biome = null;
      next.yaw = null;
      next.facingReceivedAt = null;
      next.pitch = null;
    }
    next.dimension = dimension;
  }
  if (has(match, "biome")) next.biome = readShortString(match.biome);
  if (has(match, "facing")) {
    const facing = decodeRecord(match.facing);
    const axes = rules.facingAxes[state.edition];
    if (!axes) throw new Error(`Missing facing axes for edition: ${state.edition}`);
    const yaw = facing?.[axes.yaw], pitch = facing?.[axes.pitch];
    if (finite(yaw) && finite(pitch)) {
      next.yaw = ((yaw % 360) + 360) % 360;
      next.facingReceivedAt = now;
      next.pitch = Math.max(-90, Math.min(90, pitch));
    } else {
      next.yaw = null;
      next.facingReceivedAt = null;
      next.pitch = null;
      next.issue = "invalid-data";
    }
  }
  if (has(match, "location")) {
    const point = decodeRecord(match.location);
    if (point && finite(point.x) && finite(point.y) && finite(point.z)
      && [point.x, point.y, point.z].every(value => Math.abs(value as number) <= rules.coordinateLimit)) {
      // Receipt times and repeat snapshots do not prove that a cached startup sample is current.
      if (next.positionReady === false && next.position
        && (point.x !== next.position.x || point.y !== next.position.y || point.z !== next.position.z)) {
        next.positionReady = true;
      }
      next.sequence += 1;
      next.position = { x: point.x, y: point.y, z: point.z, receivedAt: now, sequence: next.sequence };
      next.inWorld = true;
      // A valid sample recovers a bad-data error, not a registration/provider failure.
      if (next.issue === "invalid-data") next.issue = null;
    } else {
      next.position = null;
      next.issue = "invalid-data";
    }
  }
  return next;
};
