import type { SessionRead } from "../game-session/session-storage.ts";
import { getSessionStatus, type GameSession } from "../game-session/session-types.ts";
import { isCurrentWorldBinding, type WorldSessionBinding } from "./world-session-binding.ts";
import type { WorldRecord } from "./world-types.ts";

export interface WorldMapPlayer {
  worldId: string; sessionKey: string; dimension: string; x: number; y: number; z: number;
  receivedAt: number; yaw: number | null; expiresAt: number; facingExpiresAt: number | null;
}

export const worldSessionKey = (binding: WorldSessionBinding): string =>
  JSON.stringify([binding.sessionId, binding.sessionGeneration, binding.confirmedAt, binding.sessionIdentity]);

const liveMapPlayer = (session: GameSession, worldId: string, sessionKey: string,
  now: number, staleAfterMs: number, dimensions: readonly string[], coordinateLimit: number): WorldMapPlayer | null => {
  const status = getSessionStatus(session, now, staleAfterMs);
  // Snapshot polling verifies stationary coordinates; an unverified old sample
  // belongs to the separate last-known marker, never to live actions.
  if (status !== "live") return null;
  const point = session.position;
  if (!point || !session.dimension || !dimensions.includes(session.dimension) ||
    ![point.x, point.y, point.z].every(value => Number.isFinite(value) && Math.abs(value) <= coordinateLimit)) return null;
  const facingAge = session.facingReceivedAt == null ? Infinity : now - session.facingReceivedAt;
  return { worldId, sessionKey, dimension: session.dimension, x: point.x, y: point.y, z: point.z,
    receivedAt: point.receivedAt,
    yaw: session.facingReceivedAt != null && facingAge >= 0 && session.yaw !== null && Number.isFinite(session.yaw)
      ? session.yaw : null,
    expiresAt: point.receivedAt + staleAfterMs, facingExpiresAt: null };
};

/** Use only the already validated, explicitly bound local-player stream; never infer a position from a seed. */
export const resolveWorldMapPlayer = (world: WorldRecord | null, read: SessionRead, binding: WorldSessionBinding | null,
  now: number, staleAfterMs: number, dimensions: readonly string[], coordinateLimit: number): WorldMapPlayer | null => {
  const session = read.session;
  if (read.error || !session || !world || !binding || !isCurrentWorldBinding(world, session, binding)) return null;
  return liveMapPlayer(session, world.id, worldSessionKey(binding), now, staleAfterMs, dimensions, coordinateLimit);
};

export const projectWorldMapPlayer = (player: WorldMapPlayer | null, dimension: string,
  view: { width: number; height: number; x: number; z: number; zoom: number } | null) => {
  if (!player || player.dimension !== dimension || !view) return null;
  const x = view.width / 2 + (player.x - view.x) * view.zoom, y = view.height / 2 + (player.z - view.z) * view.zoom;
  return { x, y, visible: x >= 0 && y >= 0 && x <= view.width && y <= view.height };
};
