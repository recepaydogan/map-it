import { asRecord } from "./gep-packet.ts";
import type { GameSession, SessionIdentity, SessionPosition } from "./session-types.ts";

export interface SessionValidationRules {
  coordinateLimit: number;
  editions: readonly { id: string; gameClassId: number }[];
}
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string" && value.length > 0 && value.length <= 512;
const nullableSeed = (value: unknown): value is string | null => value === null || typeof value === "string"
  && /^-?\d{1,19}$/.test(value) && (() => { try { return BigInt.asIntN(64, BigInt(value)).toString() === value; } catch { return false; } })();

/** Rebuild the allow-list at the window boundary; never trust a cast of stored provider data. */
export const parseGameSession = (input: unknown, rules: SessionValidationRules): GameSession => {
  const value = asRecord(input);
  if (!value || value.schemaVersion !== 1 || typeof value.id !== "string" || !value.id.trim() || value.id.length > 512
    || !rules.editions.some(edition => edition.id === value.edition && edition.gameClassId === value.gameClassId)
    || typeof value.connected !== "boolean" || typeof value.registered !== "boolean" || typeof value.inWorld !== "boolean"
    || !integer(value.generation) || !integer(value.sequence)
    || !(value.issue === null || value.issue === "provider-error" || value.issue === "invalid-data" || value.issue === "missing-features")
    || ![value.gameVersion, (value.worldDisplayName ?? null), value.playerName, value.dimension, value.biome, (value.sceneKey ?? null)].every(nullableText)
    || !nullableSeed(value.worldSeed ?? null)
    || !(value.localWorldId == null || typeof value.localWorldId === "string" && /^[a-f0-9]{64}$/.test(value.localWorldId))
    || !(value.yaw === null || finite(value.yaw) && value.yaw >= 0 && value.yaw < 360)
    || !(value.facingReceivedAt == null || integer(value.facingReceivedAt))
    || !(value.positionReady === undefined || typeof value.positionReady === "boolean")
    || !(value.pitch === null || finite(value.pitch) && Math.abs(value.pitch) <= 90)) throw new Error("Invalid stored game session.");
  const rawIdentity = asRecord(value.identity);
  if (!rawIdentity || ![rawIdentity.worldName, rawIdentity.server, rawIdentity.realmId, rawIdentity.realmName].every(nullableText))
    throw new Error("Invalid stored session identity.");
  const identity: SessionIdentity = { worldName: rawIdentity.worldName as string | null, server: rawIdentity.server as string | null,
    realmId: rawIdentity.realmId as string | null, realmName: rawIdentity.realmName as string | null };
  let position: SessionPosition | null = null;
  if (value.position !== null) {
    const point = asRecord(value.position);
    if (!point || ![point.x, point.y, point.z].every(axis => finite(axis) && Math.abs(axis) <= rules.coordinateLimit)
      || !integer(point.receivedAt) || !integer(point.sequence) || point.sequence > value.sequence || point.sequence === 0)
      throw new Error("Invalid stored session position.");
    position = { x: point.x as number, y: point.y as number, z: point.z as number, receivedAt: point.receivedAt, sequence: point.sequence };
  }
  return { schemaVersion: 1, id: value.id, gameClassId: value.gameClassId as number, edition: value.edition as string,
    connected: value.connected, registered: value.registered, inWorld: value.inWorld, generation: value.generation, sequence: value.sequence,
    identity, gameVersion: value.gameVersion as string | null, worldSeed: value.worldSeed as string | null ?? null,
    worldDisplayName: value.worldDisplayName as string | null ?? null,
    ...(value.localWorldId === undefined ? {} : { localWorldId: value.localWorldId as string | null }),
    playerName: value.playerName as string | null,
    dimension: value.dimension as string | null, biome: value.biome as string | null,
    yaw: value.yaw as number | null, facingReceivedAt: value.facingReceivedAt as number | null ?? null,
    pitch: value.pitch as number | null, position, issue: value.issue as GameSession["issue"],
    ...(value.positionReady === undefined ? {} : { positionReady: value.positionReady as boolean }),
    sceneKey: (value.sceneKey as string | null) ?? null };
};

export const decodeStoredSession = (raw: string | null, rules: SessionValidationRules): GameSession | null => {
  if (raw === null) return null;
  if (raw.length > 32_768) throw new Error("Stored game session exceeds its character budget.");
  return parseGameSession(JSON.parse(raw), rules);
};
