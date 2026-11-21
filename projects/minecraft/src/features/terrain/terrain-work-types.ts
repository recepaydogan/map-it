import type { ColumnReadContext, DecodedColumn } from "./read-paletted-column.ts";
import type { RegionColumnOptions } from "./read-region-column.ts";
import type { RegionPayload } from "./read-sector-region.ts";
import type { DecodedSubchunk, SubchunkReadContext } from "./read-layered-subchunk.ts";
import type { SectionMesh, VoxelShape } from "./mesh-voxel-section.ts";
import type { VoxelSection } from "./voxel-section.ts";
import type { Point3 } from "./orbit-camera.ts";
import type { TerrainScope } from "./terrain-scope.ts";

export interface SectionMeshSource { origin: Point3; section: VoxelSection; shapes: readonly VoxelShape[] }
export type TerrainWork =
  | { kind: "column"; payload: RegionPayload; context: ColumnReadContext;
      options: Omit<RegionColumnOptions, "tags"> & { tags: Omit<RegionColumnOptions["tags"], "signal"> } }
  | { kind: "subchunk"; bytes: Uint8Array; context: Omit<SubchunkReadContext, "signal"> }
  | { kind: "mesh"; source: SectionMeshSource; neighbors?: readonly SectionMeshSource[]; cutawayY?: number | null };

export type TerrainWorkResult =
  | { kind: "column"; value: DecodedColumn & { timestampSeconds: number } }
  | { kind: "subchunk"; value: DecodedSubchunk }
  | { kind: "mesh"; value: SectionMesh };

export interface TerrainWorkRequest<Work = TerrainWork> { id: number; scope: TerrainScope; work: Work }
export type TerrainWorkResponse<Result = TerrainWorkResult> =
  | { id: number; scope: TerrainScope; ok: true; result: Result }
  | { id: number; scope: TerrainScope; ok: false; error: string };
