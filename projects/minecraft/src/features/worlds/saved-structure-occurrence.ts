import { GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS } from "../../game-config.ts";
import type { SavedStructureStart } from "../terrain/read-saved-structure-starts.ts";

export interface SavedStructureOccurrence {
  id: string;
  type: string;
  rawKey: string;
  rawId: string;
  chunkX: number;
  chunkZ: number;
  boundingBox: readonly [number, number, number, number, number, number];
  /** A presentation anchor derived from the exact bounding box, not a claimed structure origin. */
  anchor: readonly [number, number, number];
  evidence: "saved-structure-start";
}

const typeById = new Map<string, (typeof GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS)[number]>(GAME_JAVA_SAVED_STRUCTURE_TYPE_IDS.flatMap(entry =>
  entry.ids.map(id => [id, entry] as const)));

/** Map only configured game identities; retain unknown source records outside the visible POI layer. */
export const savedStructureOccurrences = (
  starts: readonly Readonly<SavedStructureStart>[],
  context: Readonly<{ version: string; dimension: string }>,
): readonly Readonly<SavedStructureOccurrence>[] => Object.freeze(starts.flatMap(start => {
  const keyEntry = typeById.get(start.key), idEntry = typeById.get(start.id);
  if (keyEntry && idEntry && keyEntry.type !== idEntry.type) return [];
  const entry = keyEntry ?? idEntry;
  if (!entry || !entry.versions.some(version => version === context.version)
    || !entry.dimensions.some(dimension => dimension === context.dimension)) return [];
  const minX = start.boundingBox[0], minZ = start.boundingBox[2];
  const maxX = start.boundingBox[3], maxY = start.boundingBox[4], maxZ = start.boundingBox[5];
  const boundingBox = Object.freeze([...start.boundingBox]) as SavedStructureOccurrence["boundingBox"];
  const anchor = Object.freeze([(minX + maxX + 1) / 2, maxY + 1, (minZ + maxZ + 1) / 2]) as SavedStructureOccurrence["anchor"];
  return [Object.freeze({
    id: JSON.stringify(["saved-structure-start", start.key, start.id, start.chunkX, start.chunkZ, ...start.boundingBox]),
    type: entry.type, rawKey: start.key, rawId: start.id, chunkX: start.chunkX, chunkZ: start.chunkZ,
    boundingBox, anchor, evidence: "saved-structure-start" as const,
  })];
}));
