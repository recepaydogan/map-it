import type { createStructureSource } from "../generation/structure-source.ts";
import type { StructureQuery } from "../generation/structure-work-types.ts";
import type { TerrainScope } from "../terrain/terrain-scope.ts";
import type { WorldRoutePoint } from "./world-route-types.ts";

const MAX_SEARCH_RINGS = 24;
const BATCH_SIZE = 64;

const ringQueries = (type: string, centerX: number, centerZ: number, radius: number): StructureQuery[] => {
  if (radius === 0) return [{ type, regionX: centerX, regionZ: centerZ }];
  const queries: StructureQuery[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    queries.push({ type, regionX: centerX + offset, regionZ: centerZ - radius });
    queries.push({ type, regionX: centerX + offset, regionZ: centerZ + radius });
  }
  for (let offset = -radius + 1; offset < radius; offset += 1) {
    queries.push({ type, regionX: centerX - radius, regionZ: centerZ + offset });
    queries.push({ type, regionX: centerX + radius, regionZ: centerZ + offset });
  }
  return queries;
};

export class StructureUnavailableError extends Error {}
export class StructureNotFoundError extends Error {}

export const findNearestWorldStructure = async (
  source: Pick<ReturnType<typeof createStructureSource>, "query">,
  scope: TerrainScope,
  type: string,
  origin: WorldRoutePoint,
  signal?: AbortSignal,
): Promise<WorldRoutePoint> => {
  const capabilityResult = await source.query(scope, [], signal);
  const capability = capabilityResult.capabilities.find(candidate => candidate.type === type);
  if (!capability?.regionSize) throw new StructureUnavailableError("Structure type is unavailable in this dimension");
  const span = capability.regionSize * 16;
  const centerX = Math.floor(origin.x / span), centerZ = Math.floor(origin.z / span);
  const candidates: WorldRoutePoint[] = [];
  let firstMatchRing: number | null = null;
  // Two complete outer rings prove a corner candidate in the first matching ring
  // cannot be beaten by an unqueried region, even when the origin hugs a region edge.
  for (let radius = 0; radius <= MAX_SEARCH_RINGS && (firstMatchRing === null || radius <= firstMatchRing + 2); radius += 1) {
    const queries = ringQueries(type, centerX, centerZ, radius);
    for (let index = 0; index < queries.length; index += BATCH_SIZE) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const result = await source.query(scope, queries.slice(index, index + BATCH_SIZE), signal);
      for (const entry of result.results) {
        if (entry.status === "candidate" && entry.candidate?.biomeViable) {
          candidates.push({ x: entry.candidate.x, z: entry.candidate.z });
          firstMatchRing ??= radius;
        }
      }
    }
  }
  const nearest = candidates.sort((left, right) =>
    Math.hypot(left.x - origin.x, left.z - origin.z) - Math.hypot(right.x - origin.x, right.z - origin.z))[0];
  if (!nearest) throw new StructureNotFoundError("No viable structure candidate was found within the bounded search");
  return nearest;
};
