import { GAME_WORLD_CATALOG, WORLD_LIBRARY_CONFIG } from "../../game-config.ts";
import type { GameSession } from "../game-session/session-types.ts";
import { candidateWorlds, isCurrentWorldBinding } from "./world-session-binding.ts";
import { compareWorldVersions, latestWorldVersion } from "./supported-world-version.ts";
import type { WorldRepository } from "./world-repository.ts";
import { generationKey, type WorldLibrarySnapshot, type WorldRecord } from "./world-types.ts";

export type LiveWorldMatch = { kind: "bound" | "matched"; world: WorldRecord }
  | { kind: "ambiguous" | "unknown" | "unavailable" };

/** A selected map alone is not evidence that its seed belongs to this session. */
export const matchLiveWorld = (snapshot: WorldLibrarySnapshot, session: GameSession): LiveWorldMatch => {
  if (!session.connected || !session.registered || !session.inWorld || session.issue) return { kind: "unavailable" };
  const bound = snapshot.worlds.find(world => world.id === snapshot.binding?.worldId);
  if (bound && isCurrentWorldBinding(bound, session, snapshot.binding)
    && (session.worldSeed === null || bound.generation.seed === session.worldSeed)) return { kind: "bound", world: bound };
  const candidates = candidateWorlds(snapshot.worlds, session)
    .filter(world => world.id !== WORLD_LIBRARY_CONFIG.exampleWorld.id);
  if (candidates.length === 1) return { kind: "matched", world: candidates[0] };
  if (candidates.length > 1) return { kind: "ambiguous" };
  if (session.identity.server || session.identity.realmId || !session.worldSeed || !session.identity.worldName)
    return { kind: "unknown" };
  const legacy = snapshot.worlds.filter(world => world.id !== WORLD_LIBRARY_CONFIG.exampleWorld.id
    && !world.association && world.edition === session.edition
    && world.generation.seed === session.worldSeed && world.name === session.identity.worldName);
  if (!legacy.length) return { kind: "unknown" };
  // Equivalent old map entries can share one save. Keep every entry's personal data;
  // attach the selected entry, or the most recently opened one, to the discovered save.
  if (legacy.some(world => generationKey(world) !== generationKey(legacy[0]))) return { kind: "ambiguous" };
  const world = legacy.find(entry => entry.id === snapshot.selection.worldId)
    ?? [...legacy].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.id.localeCompare(b.id))[0];
  return { kind: "matched", world };
};

/** Restore a unique association; create a local world only from discovered save metadata. */
export const autoConnectLiveWorld = async (
  repository: WorldRepository, session: GameSession, now = Date.now(), isCurrent: () => boolean = () => true,
  allowCreate = true,
): Promise<WorldRecord | null> => {
  const snapshot = await repository.snapshot();
  if (!isCurrent()) return null;
  const match = matchLiveWorld(snapshot, session);
  if (match.kind === "bound") return match.world;
  if (match.kind === "ambiguous" || match.kind === "unavailable") return null;
  const remote = !!(session.identity.server || session.identity.realmId);
  const world = match.kind === "matched" ? match.world : null;
  if (remote && !world) return null;
  const catalog = GAME_WORLD_CATALOG[session.edition as keyof typeof GAME_WORLD_CATALOG];
  const mapVersion = catalog ? latestWorldVersion(catalog.versions) : null;
  // A failed seed read can still restore a previously confirmed local save.
  if (!world && (!session.worldSeed || !session.identity.worldName || !mapVersion)) return null;
  if (!world && !allowCreate) return null;
  const version = world && !remote && mapVersion && world.generation.preset === "default"
    && Object.keys(world.generation.settings).length === 0
    && compareWorldVersions(world.generation.version, mapVersion) === -1 ? mapVersion : undefined;
  return repository.connectSessionWorld({
    ...(world ? { worldId: world.id, version } : { create: {
      name: session.worldDisplayName ?? session.identity.worldName!, edition: session.edition,
      generation: { version: mapVersion!, seed: session.worldSeed!, preset: "default", settings: {} },
    } }), selectionRevision: snapshot.selection.revision, session, confirmedAt: now,
  }, isCurrent);
};
