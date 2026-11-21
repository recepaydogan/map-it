import { assertSection, voxelIndex } from "./voxel-section.ts";
import type { VoxelSection } from "./voxel-section.ts";

/** Non-cube models and fluids must be handled by their own geometry builders. */
export type VoxelShape = "empty" | "opaque-cube" | "model";
export type NeighborShape = VoxelShape | "unknown";
type Triple = readonly [number, number, number];
interface Face { normal: Triple; corners: readonly Triple[] }

/** Counter-clockwise winding as seen from outside, in X/Y/Z world axes. */
export const VOXEL_FACES: readonly Face[] = [
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
];

export interface SectionMesh {
  /** Local geometry avoids float precision loss far from the world origin. */
  origin: Triple;
  positions: Float32Array;
  normals: Int8Array;
  triangles: Uint32Array;
  /** One record per quad: exact block picking, palette lookup, face texture, coverage. */
  blockIndices: Uint16Array;
  paletteIndices: Uint16Array;
  faceDirections: Uint8Array;
  /** bit 0: unknown neighbor; bit 1: a face exposed by the Y cutaway. */
  faceFlags: Uint8Array;
  deferredModelIndices: Uint16Array;
}

export interface MeshSectionOptions {
  origin: Triple;
  shapes: readonly VoxelShape[];
  /** Keeps blocks whose base Y <= this inclusive world level. null disables cutting. */
  cutawayY?: number | null;
  /** Coordinates are absolute. Missing neighbors stay unknown, never implicit empty blocks. */
  neighbor?: (x: number, y: number, z: number) => NeighborShape;
}

export const meshVoxelSection = (section: VoxelSection, options: MeshSectionOptions): SectionMesh => {
  assertSection(section);
  const { origin, shapes, neighbor } = options;
  const cutawayY = options.cutawayY ?? null;
  if (origin.length !== 3 || Array.from(origin).some(value => !Number.isSafeInteger(value) || value % 16 !== 0 ||
    !Number.isSafeInteger(value + 16) || !Number.isSafeInteger(value - 1)))
    throw new Error("Invalid section origin");
  if (shapes.length !== section.palette.length || Array.from(shapes).some(shape => !["empty", "opaque-cube", "model"].includes(shape)))
    throw new Error("Missing or invalid palette geometry classification");
  if (cutawayY !== null && !Number.isSafeInteger(cutawayY)) throw new Error("Invalid cutaway level");
  const positions: number[] = [], normals: number[] = [], triangles: number[] = [];
  const blocks: number[] = [], palette: number[] = [], directions: number[] = [], flags: number[] = [], models: number[] = [];
  for (let y = 0; y < 16; y++) {
    if (cutawayY !== null && origin[1] + y > cutawayY) continue;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const block = voxelIndex(x, y, z);
      const state = section.indices[block];
      if (shapes[state] === "empty") continue;
      if (shapes[state] === "model") { models.push(block); continue; }
      for (let direction = 0; direction < VOXEL_FACES.length; direction++) {
        const face = VOXEL_FACES[direction];
        const nx = x + face.normal[0], ny = y + face.normal[1], nz = z + face.normal[2];
        const cut = cutawayY !== null && origin[1] + ny > cutawayY;
        const inside = nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && nz >= 0 && nz < 16;
        const adjacent = cut ? "empty" : inside ? shapes[section.indices[voxelIndex(nx, ny, nz)]]
          : neighbor ? neighbor(origin[0] + nx, origin[1] + ny, origin[2] + nz) : "unknown";
        if (!["empty", "opaque-cube", "model", "unknown"].includes(adjacent)) throw new Error("Invalid neighbor geometry");
        if (adjacent === "opaque-cube") continue;
        const start = positions.length / 3;
        for (const corner of face.corners) {
          positions.push(x + corner[0], y + corner[1], z + corner[2]);
          normals.push(...face.normal);
        }
        triangles.push(start, start + 1, start + 2, start, start + 2, start + 3);
        blocks.push(block); palette.push(state); directions.push(direction);
        flags.push((adjacent === "unknown" ? 1 : 0) | (cut ? 2 : 0));
      }
    }
  }
  return {
    origin: [...origin], positions: new Float32Array(positions), normals: new Int8Array(normals),
    triangles: new Uint32Array(triangles), blockIndices: new Uint16Array(blocks),
    paletteIndices: new Uint16Array(palette), faceDirections: new Uint8Array(directions),
    faceFlags: new Uint8Array(flags), deferredModelIndices: new Uint16Array(models),
  };
};
