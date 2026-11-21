import { WORLD_LIBRARY_CONFIG } from "../../game-config.ts";
import type { GameSession } from "../game-session/session-types.ts";
import { confirmSessionWorld, isCurrentWorldBinding, sessionAssociation } from "./world-session-binding.ts";
import type { WorldRepository } from "./world-repository.ts";
import type { WorldRecord } from "./world-types.ts";

/** Explicit selection can recover a remote world or a local save whose seed read failed. */
export const bindSelectedServerWorld = async (
  repository: WorldRepository, world: WorldRecord, session: GameSession | null, now = Date.now(),
  currentSession: () => GameSession | null = () => session,
): Promise<boolean> => {
  if (!session?.connected || !session.registered || !session.inWorld || session.issue
    || world.id === WORLD_LIBRARY_CONFIG.exampleWorld.id
    || !(session.identity.server || session.identity.realmId || session.identity.worldName) || world.edition !== session.edition
    || session.worldSeed !== null && world.generation.seed !== session.worldSeed) return false;
  const snapshot = await repository.snapshot();
  if (snapshot.selection.worldId !== world.id) return false;
  const binding = confirmSessionWorld(world, session, now);
  await repository.bindSession(binding, snapshot.selection.revision,
    sessionAssociation(session, now), () => {
      const latest = currentSession();
      return !!latest?.registered && !latest.issue && isCurrentWorldBinding(world, latest, binding);
    });
  return true;
};
