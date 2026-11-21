import { VOXEL_FACES } from "./mesh-voxel-section.ts";
import type { SectionMesh } from "./mesh-voxel-section.ts";

export interface FaceMaterial { tile: number; tint: readonly [number, number, number] }
export interface TerrainDrawEntry { id: string; mesh: SectionMesh; materials: readonly (readonly FaceMaterial[])[] }
export interface TerrainTextureArray { size: number; layers: number; rgba: Uint8Array }
export const VERTEX_FLOATS = 13;

export const validateTextureArray = (textures: TerrainTextureArray): void => {
  if (!Number.isInteger(textures.size) || textures.size < 1 || textures.size > 256 ||
    !Number.isInteger(textures.layers) || textures.layers < 1 || textures.layers > 2048 ||
    !(textures.rgba instanceof Uint8Array) || textures.rgba.length !== textures.size ** 2 * textures.layers * 4 ||
    textures.rgba.length > 64 * 1024 * 1024) throw new Error("Invalid or oversized terrain textures");
};

/** Expand per-face material references without baking any game-specific block names. */
export const buildTerrainVertices = (entry: TerrainDrawEntry, textureLayers: number): Float32Array => {
  const { mesh } = entry;
  const faces = mesh.blockIndices.length;
  if (!entry.id || faces > 24576 || mesh.positions.length !== faces * 12 || mesh.normals.length !== faces * 12 ||
    mesh.triangles.length !== faces * 6 || mesh.paletteIndices.length !== faces || mesh.faceDirections.length !== faces || mesh.faceFlags.length !== faces)
    throw new Error("Invalid section draw buffers");
  if (mesh.origin.length !== 3 || Array.from(mesh.origin).some(value => !Number.isSafeInteger(value) || value % 16 !== 0) ||
    mesh.positions.some(value => !Number.isFinite(value) || value < 0 || value > 16) ||
    mesh.triangles.some(index => index >= faces * 4)) throw new Error("Invalid section geometry");
  const data = new Float32Array(faces * 4 * VERTEX_FLOATS);
  const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let face = 0; face < faces; face++) {
    const material = entry.materials[mesh.paletteIndices[face]]?.[mesh.faceDirections[face]];
    if (!material || !Number.isInteger(material.tile) || material.tile < 0 || material.tile >= textureLayers ||
      material.tint.length !== 3 || Array.from(material.tint).some(value => !Number.isFinite(value) || value < 0 || value > 1))
      throw new Error("Missing or invalid face material");
    if (mesh.faceDirections[face] > 5 || mesh.faceFlags[face] > 3 || mesh.blockIndices[face] >= 4096)
      throw new Error("Invalid section face metadata");
    const shape = VOXEL_FACES[mesh.faceDirections[face]], block = mesh.blockIndices[face];
    const base = [block & 15, block >> 8, (block >> 4) & 15];
    const expectedIndices = [0, 1, 2, 0, 2, 3];
    if (expectedIndices.some((value, index) => mesh.triangles[face * 6 + index] !== face * 4 + value))
      throw new Error("Section triangle layout does not match picking metadata");
    for (let vertex = 0; vertex < 4; vertex++) {
      const position = face * 12 + vertex * 3, offset = (face * 4 + vertex) * VERTEX_FLOATS;
      if (base.some((value, axis) => mesh.positions[position + axis] !== value + shape.corners[vertex][axis] || mesh.normals[position + axis] !== shape.normal[axis]))
        throw new Error("Section geometry does not match block identity");
      data.set(mesh.positions.subarray(position, position + 3), offset);
      data.set(mesh.normals.subarray(position, position + 3), offset + 3);
      data.set([...uv[vertex], material.tile], offset + 6);
      data.set(material.tint, offset + 9);
      data[offset + 12] = mesh.faceFlags[face];
    }
  }
  return data;
};
