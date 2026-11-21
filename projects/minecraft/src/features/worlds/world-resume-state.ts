import { GAME_TELEMETRY } from "../../game-config.ts";
import type { GameSession } from "../game-session/session-types.ts";
import { resolveBoundSession } from "./world-session-binding.ts";
import type { WorldRepository } from "./world-repository.ts";
import { generationKey, type WorldRecord, type WorldMapSurface } from "./world-types.ts";

export const readLastWorldPosition = (world: WorldRecord, now: number) => {
  const point = world.personal.resume?.lastPosition;
  return point && point.generationKey === generationKey(world) && point.receivedAt <= now ? point : null;
};

export const readResumeDimension = (world: WorldRecord, surface: WorldMapSurface, dimensions: readonly string[], now: number) => {
  const dimension = world.personal.resume?.dimensionBySurface?.[surface]
    ?? readLastWorldPosition(world, now)?.dimension;
  return dimension && dimensions.includes(dimension) ? dimension : dimensions[0];
};

/** Only the verified bound stream can advance a world's last known position. */
export const saveWorldResumePosition = async (repository: WorldRepository, session: GameSession, now: number,
  isCurrent: () => boolean = () => true) => {
  const library = await repository.snapshot();
  const binding = library.binding;
  const world = library.worlds.find(item => item.id === binding?.worldId) ?? null;
  const bound = resolveBoundSession(world, session, binding, now, GAME_TELEMETRY.staleAfterMs);
  if (!isCurrent() || !world || !binding || bound.status !== "live" || !session.position || !session.dimension) return;
  const { x, y, z, receivedAt } = session.position;
  const previous = world.personal.resume?.lastPosition;
  if (previous && previous.receivedAt >= receivedAt) return;
  const point = { x, y, z, receivedAt, dimension: session.dimension, generationKey: generationKey(world) };
  await repository.updateBoundPersonal(binding, personal => {
    if (personal.resume?.lastPosition && personal.resume.lastPosition.receivedAt >= receivedAt) return personal;
    return { ...personal, resume: { ...personal.resume, lastPosition: point } };
  }, isCurrent);
};
