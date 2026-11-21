import type { ReferenceEntry } from "./reference-types";

/** Shared object IDs may occur in many dungeons; the selected marker selects its guide. */
export function chestDungeonId(entry: ReferenceEntry | undefined, mapId: string, markerId: string) {
  return entry?.rewardObject?.dungeonContexts?.find((context) =>
    context.mapId === mapId && context.markerIds.includes(markerId))?.dungeonId;
}
