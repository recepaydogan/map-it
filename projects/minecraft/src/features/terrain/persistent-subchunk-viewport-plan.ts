import type { PersistentSubchunkKey } from "./persistent-subchunk-key.ts";

export interface PersistentSubchunkViewportPlanOptions {
  focus: Readonly<{ x: number; y: number; z: number }>;
  dimension: number;
  minSectionY: number;
  maxSectionY: number;
  radiusChunks?: number;
  maxColumns?: number;
  maxSections?: number;
}

export interface PersistentSubchunkViewportRequestPlan {
  focusChunkX: number;
  focusChunkZ: number;
  requests: readonly Readonly<PersistentSubchunkKey>[];
  columns: readonly Readonly<{ chunkX: number; chunkZ: number }>[];
  truncated: boolean;
}

const validInt32 = (value: number) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;

/** Plans a bounded camera-local Bedrock request set without treating absent database keys as empty terrain. */
export const planPersistentSubchunkViewport = ({ focus, dimension, minSectionY, maxSectionY,
  radiusChunks = 4, maxColumns = 64, maxSections = 256 }: PersistentSubchunkViewportPlanOptions): PersistentSubchunkViewportRequestPlan => {
  if (![focus.x, focus.y, focus.z].every(Number.isFinite) || !validInt32(dimension) ||
    !Number.isSafeInteger(minSectionY) || !Number.isSafeInteger(maxSectionY) || minSectionY < -128 || maxSectionY > 127 ||
    minSectionY > maxSectionY || !Number.isSafeInteger(radiusChunks) || radiusChunks < 0 || radiusChunks > 16 ||
    !Number.isSafeInteger(maxColumns) || maxColumns < 1 || maxColumns > 256 ||
    !Number.isSafeInteger(maxSections) || maxSections < 1 || maxSections > 256)
    throw new Error("Invalid persistent subchunk viewport planning request");
  const focusChunkX = Math.floor(focus.x / 16), focusChunkZ = Math.floor(focus.z / 16);
  if (!validInt32(focusChunkX) || !validInt32(focusChunkZ))
    throw new Error("Persistent subchunk viewport focus is outside supported coordinates");
  const candidates: { chunkX: number; chunkZ: number; distance: number; ring: number }[] = [];
  for (let z = -radiusChunks; z <= radiusChunks; z++) for (let x = -radiusChunks; x <= radiusChunks; x++) {
    const chunkX = focusChunkX + x, chunkZ = focusChunkZ + z;
    if (!validInt32(chunkX) || !validInt32(chunkZ)) continue;
    candidates.push({ chunkX, chunkZ, distance: x * x + z * z, ring: Math.max(Math.abs(x), Math.abs(z)) });
  }
  candidates.sort((left, right) => left.distance - right.distance || left.ring - right.ring ||
    left.chunkZ - right.chunkZ || left.chunkX - right.chunkX);
  const selectedColumns = candidates.slice(0, maxColumns);
  const focusSectionY = Math.max(minSectionY, Math.min(maxSectionY, Math.floor(focus.y / 16)));
  const sectionYs = Array.from({ length: maxSectionY - minSectionY + 1 }, (_, index) => minSectionY + index)
    .sort((left, right) => Math.abs(left - focusSectionY) - Math.abs(right - focusSectionY) || right - left);
  const requests: PersistentSubchunkKey[] = [];
  for (const sectionY of sectionYs) for (const column of selectedColumns) {
    if (requests.length >= maxSections) break;
    requests.push({ chunkX: column.chunkX, chunkZ: column.chunkZ, dimension, sectionY });
  }
  const requestedColumns = new Map<string, { chunkX: number; chunkZ: number }>();
  for (const request of requests) requestedColumns.set(`${request.chunkX},${request.chunkZ}`,
    { chunkX: request.chunkX, chunkZ: request.chunkZ });
  return Object.freeze({
    focusChunkX,
    focusChunkZ,
    requests: Object.freeze(requests.map(request => Object.freeze(request))),
    columns: Object.freeze([...requestedColumns.values()].map(column => Object.freeze(column))),
    truncated: requests.length < selectedColumns.length * sectionYs.length || selectedColumns.length < candidates.length,
  });
};
