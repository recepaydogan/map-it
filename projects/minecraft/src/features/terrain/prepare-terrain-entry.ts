import { buildTerrainVertices } from "./terrain-draw-data.ts";
import type { TerrainDrawEntry } from "./terrain-draw-data.ts";

export interface PreparedTerrainEntry { id: string; mesh: TerrainDrawEntry["mesh"]; vertices: Float32Array }
export const entryGpuBytes = (entry: PreparedTerrainEntry): number => entry.vertices.byteLength + entry.mesh.triangles.byteLength;

/** Retain privately owned source data for picking, streaming and graphics-context recovery. */
export const prepareTerrainEntry = (entry: TerrainDrawEntry, textureLayers: number): PreparedTerrainEntry => {
  if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 512) throw new Error("Invalid terrain entry identity");
  return { id: entry.id, vertices: buildTerrainVertices(entry, textureLayers),
    mesh: { origin: [...entry.mesh.origin] as [number, number, number], positions: new Float32Array(entry.mesh.positions),
      normals: new Int8Array(entry.mesh.normals), triangles: new Uint32Array(entry.mesh.triangles),
      blockIndices: new Uint16Array(entry.mesh.blockIndices), paletteIndices: new Uint16Array(entry.mesh.paletteIndices),
      faceDirections: new Uint8Array(entry.mesh.faceDirections), faceFlags: new Uint8Array(entry.mesh.faceFlags),
      deferredModelIndices: new Uint16Array(entry.mesh.deferredModelIndices) } };
};
