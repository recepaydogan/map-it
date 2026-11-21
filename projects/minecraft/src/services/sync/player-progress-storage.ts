import {
  clearSavedMapProgress,
  migrateSavedMapStorage,
  readSavedMapProgress,
  replaceSavedMapProgress,
  SAVED_MAP_CHANGE_EVENT,
} from "../../features/map/saved-map-storage";
import { terrainDirectoryHandleRepository } from "../../features/worlds/terrain-directory-handles";
import {
  refreshWorldLibrary,
  worldRepository,
} from "../../features/worlds/use-world-library";
import { getBrowserJourneyStorage } from "../../features/journey/journey-storage";
import {
  fromAccountWorld,
  toAccountWorld,
  type PlayerProgress,
} from "./player-progress";

const notifyMapChange = (): void => {
  window.dispatchEvent(new Event(SAVED_MAP_CHANGE_EVENT));
};

const removeOrphanedTerrainHandles = async (
  previousIds: string[],
  retainedIds: Set<string>,
): Promise<void> => {
  const removedIds = previousIds.filter(worldId => !retainedIds.has(worldId));
  for (const worldId of removedIds) {
    try {
      getBrowserJourneyStorage().remove(worldId);
    } catch (error) {
      console.warn(`[Progress sync] Unable to clear journey data for ${worldId}:`, error);
    }
  }
  const results = await Promise.allSettled(
    removedIds.map(worldId => terrainDirectoryHandleRepository.removeWorld(worldId)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[Progress sync] Unable to clear a terrain directory permission:", result.reason);
    }
  }
};

export const readLocalPlayerProgress = async (): Promise<PlayerProgress> => {
  migrateSavedMapStorage();
  const snapshot = await worldRepository.snapshot();
  return {
    map: readSavedMapProgress(),
    worlds: snapshot.worlds.map(toAccountWorld),
  };
};

export const replaceLocalPlayerProgress = async (
  progress: PlayerProgress,
  userId?: string,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  const previous = await worldRepository.snapshot();
  if (!isCurrent()) return;
  const worlds = progress.worlds.map(fromAccountWorld);
  await worldRepository.replaceAccountWorlds(worlds, userId, isCurrent);
  if (!isCurrent()) return;
  await removeOrphanedTerrainHandles(
    previous.worlds.map(world => world.id),
    new Set(worlds.map(world => world.id)),
  );
  if (!isCurrent()) return;
  replaceSavedMapProgress(progress.map);
  notifyMapChange();
  await refreshWorldLibrary();
};

/** Clears account/player-owned data while leaving global device preferences untouched. */
export const clearLocalPlayerProgress = async (userId?: string): Promise<void> => {
  const previous = await worldRepository.snapshot();
  if (!await worldRepository.clearAccountWorlds(userId)) return;
  await removeOrphanedTerrainHandles(previous.worlds.map(world => world.id), new Set());
  clearSavedMapProgress();
  notifyMapChange();
  await refreshWorldLibrary();
};
