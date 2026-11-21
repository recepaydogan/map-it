import {
  sanitizeSavedMapProgress,
  type SavedMapProgress,
} from "../../features/map/saved-map-storage.ts";
import { GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config.ts";
import { mergeObservedPortals } from "../../features/journey/journey-observed-portals.ts";
import { assertWorldRecord } from "../../features/worlds/world-validation.ts";
import type {
  WorldPersonalState,
  WorldRecord,
} from "../../features/worlds/world-types.ts";

const PAYLOAD_VERSION = 1;

export interface AccountWorld extends Omit<WorldRecord, "association" | "personal"> {
  personal: Omit<WorldPersonalState, "views" | "resume">;
}

export interface PlayerProgress {
  map: SavedMapProgress;
  worlds: AccountWorld[];
}

export interface CloudProgress {
  rev: number;
  progress: PlayerProgress;
}

export interface ProgressStamp {
  userId: string;
  rev: number;
}

export const EMPTY_PLAYER_PROGRESS: PlayerProgress = {
  map: { favoriteIds: [], completedIds: [], markers: [], notes: {} },
  worlds: [],
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toWorldRecord = (value: unknown): WorldRecord | null => {
  if (!record(value) || !record(value.personal)) return null;
  const candidate = {
    ...value,
    association: null,
    personal: { ...value.personal, views: {}, resume: undefined },
  };
  try {
    assertWorldRecord(candidate);
    return candidate;
  } catch {
    return null;
  }
};

export const toAccountWorld = (world: WorldRecord): AccountWorld => ({
  schemaVersion: world.schemaVersion,
  id: world.id,
  name: world.name,
  edition: world.edition,
  generation: world.generation,
  favorite: world.favorite,
  createdAt: world.createdAt,
  lastOpenedAt: world.lastOpenedAt,
  movedToBottomAt: world.movedToBottomAt,
  personal: {
    pins: world.personal.pins,
    portals: world.personal.portals ?? [],
    removedPortals: world.personal.removedPortals ?? [],
    favorites: world.personal.favorites,
    found: world.personal.found,
    notes: world.personal.notes,
    tracked: world.personal.tracked,
  },
});

export const fromAccountWorld = (world: AccountWorld): WorldRecord => ({
  ...world,
  association: null,
  personal: { ...world.personal, views: {}, resume: undefined },
});

export const parsePlayerProgress = (value: unknown): PlayerProgress => {
  if (!record(value)) return structuredClone(EMPTY_PLAYER_PROGRESS);
  const worlds = Array.isArray(value.worlds)
    ? value.worlds
        .map(toWorldRecord)
        .filter((world): world is WorldRecord => world !== null)
        .map(toAccountWorld)
    : [];
  return {
    map: sanitizeSavedMapProgress(value.map),
    worlds: [...new Map(worlds.map(world => [world.id, world])).values()],
  };
};

const union = (left: string[], right: string[]): string[] =>
  [...new Set([...left, ...right])];

const mergeById = <T extends { id: string }>(remote: T[], local: T[]): T[] => {
  const merged = new Map(remote.map(item => [item.id, item]));
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()];
};

const mergeNotes = (
  remote: Record<string, string>,
  local: Record<string, string>,
): Record<string, string> => ({ ...remote, ...local });

const mergeWorld = (local: AccountWorld, remote: AccountWorld): AccountWorld => {
  const removedPortals = mergeObservedPortals(remote.personal.removedPortals ?? [],
    local.personal.removedPortals ?? [], GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance);
  return {
    ...remote,
    ...local,
    personal: {
      pins: mergeById(remote.personal.pins, local.personal.pins),
      portals: mergeObservedPortals(remote.personal.portals ?? [], local.personal.portals ?? [],
        GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance, removedPortals),
      removedPortals,
      favorites: union(local.personal.favorites, remote.personal.favorites),
      found: union(local.personal.found, remote.personal.found),
      notes: mergeNotes(remote.personal.notes, local.personal.notes),
      tracked: mergeById(remote.personal.tracked, local.personal.tracked),
    },
  };
};

export const mergePlayerProgress = (
  local: PlayerProgress,
  remote: PlayerProgress,
): PlayerProgress => {
  const remoteWorlds = new Map(remote.worlds.map(world => [world.id, world]));
  for (const localWorld of local.worlds) {
    const remoteWorld = remoteWorlds.get(localWorld.id);
    remoteWorlds.set(
      localWorld.id,
      remoteWorld ? mergeWorld(localWorld, remoteWorld) : localWorld,
    );
  }
  return {
    map: {
      favoriteIds: union(local.map.favoriteIds, remote.map.favoriteIds),
      completedIds: union(local.map.completedIds, remote.map.completedIds),
      markers: mergeById(remote.map.markers, local.map.markers),
      notes: mergeNotes(remote.map.notes, local.map.notes),
    },
    worlds: [...remoteWorlds.values()],
  };
};

const sorted = (values: string[]): string[] => [...values].sort();
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!record(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => [key, canonicalValue(entry)]));
};

export const canonicalizePlayerProgress = (progress: PlayerProgress): string =>
  JSON.stringify(canonicalValue({
    v: PAYLOAD_VERSION,
    map: {
      favoriteIds: sorted(progress.map.favoriteIds),
      completedIds: sorted(progress.map.completedIds),
      markers: [...progress.map.markers].sort((left, right) => left.id.localeCompare(right.id)),
      notes: progress.map.notes,
    },
    worlds: [...progress.worlds]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(world => ({
        ...world,
        generation: world.generation,
        personal: {
          pins: [...world.personal.pins].sort((left, right) => left.id.localeCompare(right.id)),
          portals: [...(world.personal.portals ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
          removedPortals: [...(world.personal.removedPortals ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
          favorites: sorted(world.personal.favorites),
          found: sorted(world.personal.found),
          notes: world.personal.notes,
          tracked: [...world.personal.tracked].sort((left, right) => left.id.localeCompare(right.id)),
        },
      })),
  }));

export const samePlayerProgress = (left: PlayerProgress, right: PlayerProgress): boolean =>
  canonicalizePlayerProgress(left) === canonicalizePlayerProgress(right);

export const isEmptyPlayerProgress = (progress: PlayerProgress): boolean =>
  samePlayerProgress(progress, EMPTY_PLAYER_PROGRESS);

export const reconcilePlayerProgress = (
  userId: string,
  local: PlayerProgress,
  cloud: CloudProgress | null,
  stamp: ProgressStamp | null,
): { desired: PlayerProgress; expectedRevision: number | null } => {
  if (stamp && stamp.userId !== userId) {
    return {
      desired: cloud?.progress ?? structuredClone(EMPTY_PLAYER_PROGRESS),
      expectedRevision: cloud?.rev ?? null,
    };
  }
  if (!cloud) return { desired: local, expectedRevision: null };
  if (stamp?.userId === userId && stamp.rev === cloud.rev) {
    return { desired: local, expectedRevision: cloud.rev };
  }
  return {
    desired: isEmptyPlayerProgress(local)
      ? cloud.progress
      : mergePlayerProgress(local, cloud.progress),
    expectedRevision: cloud.rev,
  };
};
