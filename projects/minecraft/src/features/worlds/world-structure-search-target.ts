import { planStructureRegions, StructureRegionLimitError, type StructureBounds } from "../generation/structure-regions.ts";
import type { createStructureSource } from "../generation/structure-source.ts";
import type { StructureQuery } from "../generation/structure-work-types.ts";
import type { TerrainScope } from "../terrain/terrain-scope.ts";
import { findNearestWorldStructure, StructureUnavailableError } from "./world-nearest-structure.ts";
import type { WorldRoutePoint } from "./world-route-types.ts";

const BATCH_SIZE = 64;

/** Keep the camera still when the selected structure exists anywhere in the visible map. */
export const findStructureSearchTarget = async (
  source: Pick<ReturnType<typeof createStructureSource>, "query">,
  scope: TerrainScope,
  type: string,
  origin: WorldRoutePoint,
  bounds: StructureBounds,
  signal?: AbortSignal,
): Promise<WorldRoutePoint | null> => {
  const { capabilities } = await source.query(scope, [], signal);
  const capability = capabilities.find(candidate => candidate.type === type);
  if (!capability?.regionSize) throw new StructureUnavailableError("Structure type is unavailable in this dimension");

  let queries: StructureQuery[];
  try { queries = planStructureRegions(bounds, [capability], 4096).queries; }
  catch (error) {
    // An overview can contain more regions than the safe query budget. Do not move
    // the camera when we cannot establish that its current view is empty.
    if (error instanceof StructureRegionLimitError) return null;
    throw error;
  }
  for (let index = 0; index < queries.length; index += BATCH_SIZE) {
    const { results } = await source.query(scope, queries.slice(index, index + BATCH_SIZE), signal);
    if (results.some(entry => {
      const point = entry.candidate;
      return entry.status === "candidate" && point?.biomeViable &&
        point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
    })) return null;
  }
  return findNearestWorldStructure(source, scope, type, origin, signal);
};
