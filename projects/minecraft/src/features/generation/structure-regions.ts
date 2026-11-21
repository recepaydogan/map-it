import type { StructureCapability, StructureQuery } from "./structure-work-types.ts";

export interface StructureBounds { minX: number; minZ: number; maxX: number; maxZ: number }

export class StructureRegionLimitError extends Error {
  constructor() { super("Structure viewport exceeds region budget; zoom in or narrow categories"); this.name = "StructureRegionLimitError"; }
}

/** Inclusive world-block bounds; floor division is essential west/north of the coordinate origin. */
export const planStructureRegions = (bounds: StructureBounds, capabilities: readonly StructureCapability[], maxQueries = 1024) => {
  const { minX, minZ, maxX, maxZ } = bounds;
  if (![minX, minZ, maxX, maxZ].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 30000000) || minX > maxX || minZ > maxZ ||
    !Number.isSafeInteger(maxQueries) || maxQueries < 1 || maxQueries > 4096 || !Array.isArray(capabilities) || capabilities.length > 256 ||
    new Set(capabilities.map(item => item.type)).size !== capabilities.length) throw new Error("Invalid structure viewport");
  const queues: (StructureQuery & { distance: number })[][] = [], unsupported: string[] = [];
  let queryCount = 0;
  for (const { type, regionSize } of capabilities) {
    if (typeof type !== "string" || !type || type.length > 128 || regionSize !== null && (!Number.isSafeInteger(regionSize) || regionSize < 1 || regionSize > 1024))
      throw new Error("Invalid structure capability");
    if (regionSize === null) { unsupported.push(type); continue; }
    const span = regionSize * 16, x0 = Math.floor(minX / span), x1 = Math.floor(maxX / span), z0 = Math.floor(minZ / span), z1 = Math.floor(maxZ / span);
    const count = (x1 - x0 + 1) * (z1 - z0 + 1);
    if (queryCount + count > maxQueries) throw new StructureRegionLimitError();
    queryCount += count;
    const queue: (StructureQuery & { distance: number })[] = [];
    for (let regionZ = z0; regionZ <= z1; regionZ++) for (let regionX = x0; regionX <= x1; regionX++) {
      const x = (regionX + .5) * span - (minX + maxX) / 2, z = (regionZ + .5) * span - (minZ + maxZ) / 2;
      queue.push({ type, regionX, regionZ, distance: x * x + z * z });
    }
    queue.sort((a, b) => a.distance - b.distance || a.regionZ - b.regionZ || a.regionX - b.regionX);
    queues.push(queue);
  }
  // Interleave categories after sorting each one from the viewport center.
  // Dense structures must not occupy the entire first batch and delay every
  // other marker family after a pan.
  const queries: (StructureQuery & { distance: number })[] = [];
  for (let index = 0; queries.length < queryCount; index++) {
    for (const queue of queues) if (queue[index]) queries.push(queue[index]);
  }
  return { queries: queries.map(({ type, regionX, regionZ }) => ({ type, regionX, regionZ })), unsupported };
};
