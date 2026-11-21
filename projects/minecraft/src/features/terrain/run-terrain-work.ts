import { readRegionColumn } from "./read-region-column.ts";
import { readLayeredSubchunk } from "./read-layered-subchunk.ts";
import { meshVoxelSection } from "./mesh-voxel-section.ts";
import { voxelIndex } from "./voxel-section.ts";
import { validateSectionSource } from "./validate-section-source.ts";
import type { TerrainWork, TerrainWorkResult } from "./terrain-work-types.ts";

const boundedLimit = (value: number | undefined, ceiling: number) => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > ceiling))
    throw new Error("Terrain decoder limit exceeds worker policy");
};

/** CPU-heavy decoding and meshing run only inside the worker in the browser adapter. */
export const runTerrainWork = async (work: TerrainWork): Promise<TerrainWorkResult> => {
  switch (work.kind) {
    case "column": {
      boundedLimit(work.options.maxCompressedBytes, 8 * 1024 * 1024);
      boundedLimit(work.options.tags.maxBytes, 16 * 1024 * 1024);
      boundedLimit(work.options.tags.maxDepth, 128);
      boundedLimit(work.options.tags.maxElements, 262144);
      boundedLimit(work.options.tags.maxStringBytes, 2 * 1024 * 1024);
      return { kind: "column", value: await readRegionColumn(work.payload, work.context, work.options) };
    }
    case "subchunk": {
      boundedLimit(work.context.maxBytes, 2 * 1024 * 1024); boundedLimit(work.context.maxLayers, 8);
      return { kind: "subchunk", value: readLayeredSubchunk(work.bytes, work.context) };
    }
    case "mesh": {
      validateSectionSource(work.source);
      const neighbors = work.neighbors ?? [], seen = new Set<string>();
      if (neighbors.length > 6) throw new Error("Too many neighboring sections");
      for (const neighbor of neighbors) {
        validateSectionSource(neighbor);
        const offsets = neighbor.origin.map((value, axis) => value - work.source.origin[axis]);
        const key = offsets.join(",");
        if (offsets.filter(value => value !== 0).length !== 1 || Math.abs(offsets.find(value => value !== 0) ?? 0) !== 16 || seen.has(key))
          throw new Error("Neighbor is duplicated or not face-adjacent");
        seen.add(key);
      }
      return { kind: "mesh", value: meshVoxelSection(work.source.section, {
        origin: work.source.origin, shapes: work.source.shapes, cutawayY: work.cutawayY,
        neighbor: (x, y, z) => {
          const coordinates = [x, y, z];
          for (const adjacent of neighbors) {
            const local = coordinates.map((value, axis) => value - adjacent.origin[axis]);
            if (local.every(value => value >= 0 && value < 16))
              return adjacent.shapes[adjacent.section.indices[voxelIndex(local[0], local[1], local[2])]];
          }
          return "unknown";
        },
      }) };
    }
    default: throw new Error("Unsupported terrain work kind");
  }
};
