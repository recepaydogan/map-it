import { getSessionStatus, type GameSession } from "../game-session/session-types.ts";
import type { WorldLibrarySnapshot } from "./world-types.ts";
import { matchLiveWorld } from "./auto-connect-live-world.ts";

export const worldTrackingStatus = (library: WorldLibrarySnapshot | null, session: GameSession | null,
  now: number, staleAfterMs: number, storageError: boolean) => {
  if (storageError) return "storageError";
  const status = getSessionStatus(session, now, staleAfterMs);
  if (status === "disconnected") return "offline";
  if (status === "error" || status === "stale" || status === "registering") return "reconnecting";
  if (!session || !session.inWorld || !library) return "waiting";
  const match = matchLiveWorld(library, session);
  if (match.kind === "bound" && library.selection.worldId !== match.world.id) return "chooseWorld";
  if (match.kind === "ambiguous") return "chooseWorld";
  if (match.kind === "unknown") {
    if (session.identity.server || session.identity.realmId) return "chooseWorld";
    return session.worldSeed !== null ? "connectingWorld" : "readingWorld";
  }
  if (match.kind === "matched") return "connectingWorld";
  return status === "live" ? "live" : "waiting";
};

/** Normal startup and automatic world loading are already explained below the map. */
export const worldTrackingNotice = (status: ReturnType<typeof worldTrackingStatus>, session: GameSession | null) => {
  if (!session?.connected || !session.inWorld) return null;
  if (status === "chooseWorld" || status === "storageError") return status;
  if (status === "reconnecting" && (session.registered || session.position)) return status;
  return null;
};
