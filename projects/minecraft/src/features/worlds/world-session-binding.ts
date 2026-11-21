import { getSessionStatus, type GameSession, type SessionStatus } from "../game-session/session-types.ts";
import { generationKey, type WorldAssociation, type WorldRecord } from "./world-types.ts";

export interface WorldSessionBinding {
  worldId: string;
  generationKey: string;
  sessionId: string;
  sessionGeneration: number;
  sessionIdentity: string;
  confirmedAt: number;
}

const identityKey = (session: GameSession): string => JSON.stringify([
  session.identity.worldName, session.identity.server, session.identity.realmId, session.localWorldId ?? null,
]);

/** A known seed and sub-world identity further constrain stored associations. */
export const sessionAssociation = (session: GameSession, confirmedAt: number): WorldAssociation | null => {
  const { realmId, server, worldName } = session.identity;
  const remoteWorld = worldName ? { worldName } : {};
  if (realmId) return { kind: "realm", identity: realmId, confirmedAt, ...remoteWorld };
  if (server) return { kind: "server", identity: server, confirmedAt, ...remoteWorld };
  if (worldName) return { kind: "local", identity: worldName, confirmedAt,
    ...(session.localWorldId ? { sourceId: session.localWorldId } : {}) };
  return null;
};

export const candidateWorlds = (worlds: WorldRecord[], session: GameSession): WorldRecord[] => {
  const hint = sessionAssociation(session, 0);
  if (!hint) return [];
  return worlds.filter(world => world.edition === session.edition
    && world.association?.kind === hint.kind && world.association.identity === hint.identity
    && (session.worldSeed === null || world.generation.seed === session.worldSeed)
    && (!world.association.sourceId || world.association.sourceId === hint.sourceId)
    && (!world.association.worldName || !hint.worldName || world.association.worldName === hint.worldName));
};

/** Called after explicit selection or unique previously confirmed association resolution. */
export const confirmSessionWorld = (world: WorldRecord, session: GameSession, now: number): WorldSessionBinding => {
  if (!session.connected || !session.registered || !session.inWorld || session.issue) {
    throw new Error("Cannot associate an unavailable game session.");
  }
  if (world.edition !== session.edition) throw new Error("World and session editions differ.");
  if (session.worldSeed !== null && session.worldSeed !== world.generation.seed)
    throw new Error("World and session seeds differ.");
  return {
    worldId: world.id, generationKey: generationKey(world), sessionId: session.id,
    sessionGeneration: session.generation, sessionIdentity: identityKey(session), confirmedAt: now,
  };
};

export type BoundSessionState =
  | { status: "live"; session: GameSession }
  | { status: Exclude<SessionStatus, "live"> | "unassociated" | "different-world"; session: null };

export const isCurrentWorldBinding = (world: WorldRecord | null, session: GameSession | null, binding: WorldSessionBinding | null): boolean =>
  !!world && !!session && !!binding && session.connected && session.inWorld && world.id === binding.worldId && world.edition === session.edition
  && binding.sessionId === session.id && binding.sessionGeneration === session.generation
  && (session.worldSeed === null || world.generation.seed === session.worldSeed)
  && binding.sessionIdentity === identityKey(session) && binding.generationKey === generationKey(world);

export const resolveBoundSession = (
  world: WorldRecord | null, session: GameSession | null, binding: WorldSessionBinding | null,
  now: number, staleAfterMs: number,
): BoundSessionState => {
  const status = getSessionStatus(session, now, staleAfterMs);
  if (status !== "live" || !session) return { status: status === "live" ? "waiting" : status, session: null };
  if (!world || !binding) return { status: "unassociated", session: null };
  if (binding.worldId !== world.id || world.edition !== session.edition) {
    return { status: "different-world", session: null };
  }
  if (!isCurrentWorldBinding(world, session, binding)) {
    return { status: "unassociated", session: null };
  }
  return { status: "live", session };
};
