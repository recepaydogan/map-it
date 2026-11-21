import type { ColumnTagSchema } from "./read-paletted-column.ts";
import type { NbtReadOptions } from "./read-bounded-nbt.ts";
import type { SavedStructureStart } from "./read-saved-structure-starts.ts";
import type { PayloadCompression } from "./decompress-bounded.ts";
import { classifyPreviewTerrainPalette, createPreviewTerrainTextures, type PreviewMaterialRules } from "./preview-terrain-materials.ts";
import type { RegionPayload } from "./read-sector-region.ts";
import type { RegionSnapshotPlan } from "./region-snapshot-plan.ts";
import type { TerrainScope } from "./terrain-scope.ts";
import type { StreamSection, TerrainSectionStream } from "./terrain-section-stream.ts";
import type { TerrainWorkerPool } from "./terrain-worker-pool.ts";
import { voxelIndex, type VoxelState } from "./voxel-section.ts";

export interface RegionSnapshotLoadProgress {
  decodedColumns: number;
  totalColumns: number;
  acceptedSections: number;
  sectionLimitReached: boolean;
}

export interface RegionSnapshotLoadResult extends RegionSnapshotLoadProgress {
  palettes: ReadonlyMap<string, readonly VoxelState[]>;
  partialSections: number;
  structureEvidence: RegionStructureEvidence;
}

export interface RegionStructureEvidence {
  columns: readonly Readonly<{ chunkX: number; chunkZ: number; coverage: "available" | "unavailable" }>[];
  starts: readonly Readonly<SavedStructureStart>[];
}

interface CachedColumn {
  payload: RegionPayload;
  entries: readonly StreamSection[];
  palettes: ReadonlyMap<string, readonly VoxelState[]>;
  structureCoverage: "available" | "unavailable";
  structureStarts: readonly Readonly<SavedStructureStart>[];
}

export interface RegionViewportLoader {
  load: (plan: RegionSnapshotPlan, signal: AbortSignal,
    onProgress?: (progress: Readonly<RegionSnapshotLoadProgress>) => void) => Promise<RegionSnapshotLoadResult>;
  /** Returns only a real retained voxel top face; absence and unloaded coverage remain unknown. */
  sampleHighestLoadedVoxel: (x: number, z: number) => Readonly<{ blockY: number; topY: number; sectionId: string }> | null;
  /** Exact retained section bounds, without implying that absent columns are empty. */
  getLoadedSectionCoverage: () => readonly Readonly<{ id: string; origin: readonly [number, number, number] }>[];
  /** Saved-world occurrences are separate evidence from seed-predicted structure candidates. */
  getLoadedStructureEvidence: () => RegionStructureEvidence;
  dispose: () => void;
}

interface RegionViewportLoaderOptions {
  scope: TerrainScope;
  profile: { dataVersion: number; minSectionY: number; maxSectionY: number };
  schema: ColumnTagSchema;
  tags: Omit<NbtReadOptions, "signal">;
  compressionModes: Readonly<Record<number, PayloadCompression>>;
  materials: PreviewMaterialRules;
  pool: TerrainWorkerPool;
  stream: TerrainSectionStream;
  maxSections?: number;
  cutawayY?: number | null;
}

const cancelled = (message: string) => Object.assign(new Error(message), { name: "AbortError" });
const samePayload = (left: RegionPayload, right: RegionPayload) => {
  if (left.chunkX !== right.chunkX || left.chunkZ !== right.chunkZ || left.slot !== right.slot ||
    left.timestampSeconds !== right.timestampSeconds || left.compressionId !== right.compressionId ||
    left.external !== right.external || left.data.byteLength !== right.data.byteLength) return false;
  for (let index = 0; index < left.data.byteLength; index++) if (left.data[index] !== right.data[index]) return false;
  return true;
};
const ownPayload = (payload: RegionPayload): RegionPayload => ({ ...payload, data: new Uint8Array(payload.data) });
const ownStructureStarts = (value: unknown, chunkX: number, chunkZ: number): readonly Readonly<SavedStructureStart>[] => {
  if (!Array.isArray(value) || value.length > 256) throw new Error("Invalid region structure metadata.");
  return Object.freeze(value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid region structure metadata.");
    const start = item as Partial<SavedStructureStart>;
    if (typeof start.key !== "string" || !start.key || start.key.length > 256 || typeof start.id !== "string" || !start.id
      || start.id.length > 256 || start.chunkX !== chunkX || start.chunkZ !== chunkZ || !Array.isArray(start.boundingBox)
      || start.boundingBox.length !== 6 || !start.boundingBox.every(Number.isSafeInteger)
      || start.boundingBox[0]! > start.boundingBox[3]! || start.boundingBox[1]! > start.boundingBox[4]!
      || start.boundingBox[2]! > start.boundingBox[5]!) throw new Error("Invalid region structure metadata.");
    return Object.freeze({ key: start.key, id: start.id, chunkX, chunkZ,
      boundingBox: Object.freeze([...start.boundingBox]) as SavedStructureStart["boundingBox"] });
  }));
};

/** Keeps overlapping decoded columns while atomically acquiring and evicting a bounded viewport. */
export const createRegionViewportLoader = ({ scope, profile, schema, tags, compressionModes, materials, pool, stream,
  maxSections = 256, cutawayY = null }: RegionViewportLoaderOptions): RegionViewportLoader => {
  if (!Number.isSafeInteger(profile.dataVersion) || profile.dataVersion < 0 || !Number.isSafeInteger(maxSections) || maxSections < 1 || maxSections > 256)
    throw new Error("Invalid region snapshot profile.");
  if (cutawayY !== null && !Number.isSafeInteger(cutawayY)) throw new Error("Invalid terrain cutaway.");
  stream.setSource(scope, createPreviewTerrainTextures(materials));
  if (cutawayY !== null) stream.setCutaway(scope, cutawayY);
  let disposed = false, revision = 0;
  let cache = new Map<string, CachedColumn>();
  let activeEntries = new Map<string, StreamSection>();
  let activeStructureEvidence: RegionStructureEvidence = Object.freeze({ columns: Object.freeze([]), starts: Object.freeze([]) });
  const ensureCurrent = (request: number, signal: AbortSignal) => {
    if (disposed) throw cancelled("Region viewport loader is disposed.");
    if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : cancelled("Region viewport load was cancelled.");
    if (request !== revision) throw cancelled("Region viewport load was superseded.");
  };
  return {
    async load(plan, signal, onProgress) {
      if (!plan || !Array.isArray(plan.payloads)) throw new Error("Invalid region snapshot plan.");
      const request = ++revision;
      ensureCurrent(request, signal);
      const desired = new Map<string, StreamSection>();
      const palettes = new Map<string, readonly VoxelState[]>();
      const nextCache = new Map<string, CachedColumn>();
      const columnKeys = new Set<string>();
      const structureColumns: RegionStructureEvidence["columns"][number][] = [];
      const structureStarts: Readonly<SavedStructureStart>[] = [];
      let decodedColumns = 0, acceptedSections = 0, sectionLimitReached = false;
      const report = () => onProgress?.({ decodedColumns, totalColumns: plan.payloads.length, acceptedSections, sectionLimitReached });
      report();
      for (const payload of plan.payloads) {
        ensureCurrent(request, signal);
        const key = JSON.stringify([payload.chunkX, payload.chunkZ]);
        if (columnKeys.has(key)) throw new Error("Duplicate region viewport column.");
        columnKeys.add(key);
        let column = cache.get(key);
        if (!column || !samePayload(column.payload, payload)) {
          const decoded = await pool.submit(scope, { kind: "column", payload,
            context: { schema, dataVersion: profile.dataVersion, chunkX: payload.chunkX, chunkZ: payload.chunkZ,
              minSectionY: profile.minSectionY, maxSectionY: profile.maxSectionY }, options: { tags, compressionModes } }, signal);
          ensureCurrent(request, signal);
          if (decoded.kind !== "column") throw new Error("Unexpected region snapshot worker result.");
          if (decoded.value.structureCoverage !== "available" && decoded.value.structureCoverage !== "unavailable")
            throw new Error("Invalid region structure coverage.");
          const columnPalettes = new Map<string, readonly VoxelState[]>();
          const entries = decoded.value.sections.filter(section => section.voxels !== null).map(section => {
            const voxels = section.voxels!;
            const id = JSON.stringify([decoded.value.chunkX, section.sectionY, decoded.value.chunkZ]);
            const resources = classifyPreviewTerrainPalette(voxels.palette, materials);
            columnPalettes.set(id, voxels.palette.map(state => ({ id: state.id, properties: { ...state.properties } })));
            return { id, source: { section: voxels,
              origin: [decoded.value.chunkX * 16, section.sectionY * 16, decoded.value.chunkZ * 16] as const,
              shapes: resources.shapes }, materials: resources.materials };
          });
          column = { payload: ownPayload(payload), entries, palettes: columnPalettes,
            structureCoverage: decoded.value.structureCoverage,
            structureStarts: ownStructureStarts(decoded.value.structureStarts, payload.chunkX, payload.chunkZ) };
        }
        const remaining = maxSections - acceptedSections;
        const selected = column.entries.slice(0, Math.max(0, remaining));
        if (selected.length < column.entries.length) sectionLimitReached = true;
        for (const entry of selected) {
          if (desired.has(entry.id)) throw new Error("Duplicate region viewport section.");
          desired.set(entry.id, entry);
          const palette = column.palettes.get(entry.id);
          if (!palette) throw new Error("Region viewport palette is missing.");
          palettes.set(entry.id, palette);
        }
        nextCache.set(key, column);
        structureColumns.push(Object.freeze({ chunkX: payload.chunkX, chunkZ: payload.chunkZ, coverage: column.structureCoverage }));
        structureStarts.push(...column.structureStarts);
        acceptedSections += selected.length; decodedColumns++; report();
        if (acceptedSections >= maxSections) { sectionLimitReached ||= decodedColumns < plan.payloads.length; break; }
      }
      if (!acceptedSections) throw new Error("The selected region contains no supported complete block sections.");
      ensureCurrent(request, signal);
      const remove = [...activeEntries.keys()].filter(id => !desired.has(id));
      const upsert = [...desired.values()].filter(entry => activeEntries.get(entry.id) !== entry);
      if (upsert.length || remove.length) stream.updateSections(scope, upsert, remove);
      const structureEvidence = Object.freeze({ columns: Object.freeze(structureColumns), starts: Object.freeze(structureStarts) });
      activeEntries = desired; cache = nextCache; activeStructureEvidence = structureEvidence;
      const final = await stream.whenIdle();
      ensureCurrent(request, signal);
      return { decodedColumns, totalColumns: plan.payloads.length, acceptedSections, sectionLimitReached,
        palettes, structureEvidence,
        partialSections: final.sections.filter(section => desired.has(section.id) && section.status === "partial").length };
    },
    sampleHighestLoadedVoxel(x, z) {
      if (disposed) throw new Error("Region viewport loader is disposed.");
      if (![x, z].every(Number.isFinite)) throw new Error("Invalid terrain sample coordinate.");
      const blockX = Math.floor(x), blockZ = Math.floor(z);
      if (![blockX, blockZ].every(Number.isSafeInteger)) throw new Error("Invalid terrain sample coordinate.");
      let result: { blockY: number; topY: number; sectionId: string } | null = null;
      for (const entry of activeEntries.values()) {
        const [originX, originY, originZ] = entry.source.origin;
        const localX = blockX - originX, localZ = blockZ - originZ;
        if (localX < 0 || localX >= 16 || localZ < 0 || localZ >= 16) continue;
        for (let localY = 15; localY >= 0; localY--) {
          const paletteIndex = entry.source.section.indices[voxelIndex(localX, localY, localZ)];
          if (entry.source.shapes[paletteIndex] === "empty") continue;
          const blockY = originY + localY;
          if (!result || blockY > result.blockY) result = { blockY, topY: blockY + 1, sectionId: entry.id };
          break;
        }
      }
      return result ? Object.freeze(result) : null;
    },
    getLoadedSectionCoverage() {
      if (disposed) throw new Error("Region viewport loader is disposed.");
      return Object.freeze([...activeEntries.values()].map(entry => Object.freeze({ id: entry.id,
        origin: Object.freeze([...entry.source.origin]) as readonly [number, number, number] })));
    },
    getLoadedStructureEvidence() {
      if (disposed) throw new Error("Region viewport loader is disposed.");
      return activeStructureEvidence;
    },
    dispose() {
      if (disposed) return;
      disposed = true; revision++; cache.clear(); activeEntries.clear();
      activeStructureEvidence = Object.freeze({ columns: Object.freeze([]), starts: Object.freeze([]) });
    },
  };
};

/** Decode and mesh one bounded region snapshot through the shared worker/stream pipeline. */
export const loadRegionSnapshot = async ({ scope, plan, profile, schema, tags, compressionModes, materials, pool, stream, signal, onProgress,
  maxSections = 256, cutawayY = null }: RegionViewportLoaderOptions & { plan: RegionSnapshotPlan; signal: AbortSignal;
    onProgress?: (progress: Readonly<RegionSnapshotLoadProgress>) => void }): Promise<RegionSnapshotLoadResult> => {
  const loader = createRegionViewportLoader({ scope, profile, schema, tags, compressionModes, materials, pool, stream,
    maxSections, cutawayY });
  try { return await loader.load(plan, signal, onProgress); }
  finally { loader.dispose(); }
};
