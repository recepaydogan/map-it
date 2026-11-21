import { loadLevelDbFolderSnapshot, type LevelDbFolderFile, type LevelDbFolderSnapshot,
  type LevelDbFolderSnapshotOptions } from "./load-leveldb-folder-snapshot.ts";
import { encodePersistentSubchunkKey, type PersistentSubchunkKey,
  type PersistentSubchunkKeySchema } from "./persistent-subchunk-key.ts";
import { classifyPreviewTerrainPalette, createPreviewTerrainTextures,
  type PreviewMaterialRules } from "./preview-terrain-materials.ts";
import type { LayeredSubchunkSchema } from "./read-layered-subchunk.ts";
import type { TerrainScope } from "./terrain-scope.ts";
import type { StreamSection, TerrainSectionStream } from "./terrain-section-stream.ts";
import type { TerrainWorkerPool } from "./terrain-worker-pool.ts";
import { voxelIndex, type VoxelSection, type VoxelState } from "./voxel-section.ts";

export interface PersistentSubchunkViewportPlan {
  files: readonly LevelDbFolderFile[];
  requests: readonly PersistentSubchunkKey[];
}

export interface PersistentSubchunkViewportProgress {
  decodedSubchunks: number;
  totalSubchunks: number;
  acceptedSections: number;
  missingSubchunks: number;
}

export interface PersistentSubchunkViewportResult extends PersistentSubchunkViewportProgress {
  root: string;
  manifestName: string;
  bytesRead: number;
  selectedTables: readonly number[];
  selectedLogs: readonly number[];
  palettes: ReadonlyMap<string, readonly VoxelState[]>;
  partialSections: number;
}

type SnapshotReader = (
  files: readonly LevelDbFolderFile[],
  options: LevelDbFolderSnapshotOptions,
) => Promise<LevelDbFolderSnapshot>;

interface PersistentSubchunkViewportOptions {
  scope: TerrainScope;
  profile: {
    expectedComparator: string;
    paletteVersions: readonly number[];
  };
  keySchema: PersistentSubchunkKeySchema;
  subchunkSchema: LayeredSubchunkSchema;
  materials: PreviewMaterialRules;
  pool: TerrainWorkerPool;
  stream: TerrainSectionStream;
  maxSections?: number;
  maxFiles?: number;
  maxInputFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxSubchunkBytes?: number;
  cutawayY?: number | null;
  loadSnapshot?: SnapshotReader;
}

interface CachedSubchunk {
  bytes: Uint8Array;
  entry: StreamSection | null;
  palette: readonly VoxelState[] | null;
  origin: readonly [number, number, number];
}

const cancelled = (message: string) => Object.assign(new Error(message), { name: "AbortError" });
const identity = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
};
const sameBytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length
  && left.every((byte, index) => byte === right[index]);
const ownPalette = (palette: readonly VoxelState[]) => Object.freeze(palette.map(state => Object.freeze({
  id: state.id,
  properties: Object.freeze({ ...state.properties }),
})));
const containsVisibleState = (section: VoxelSection, materials: PreviewMaterialRules) => {
  const { shapes } = classifyPreviewTerrainPalette(section.palette, materials);
  const used = new Set(section.indices);
  return [...used].some(index => shapes[index] !== "empty");
};

/**
 * Connects a bounded, explicitly supplied persistent LevelDB snapshot to the shared terrain stream.
 * Release-specific palette versions remain mandatory; this adapter never guesses them from input data.
 */
export const createPersistentSubchunkViewportLoader = ({ scope, profile, keySchema, subchunkSchema, materials,
  pool, stream, maxSections = 256, maxFiles, maxInputFiles, maxTotalBytes, maxFileBytes,
  maxSubchunkBytes, cutawayY = null, loadSnapshot = loadLevelDbFolderSnapshot }: PersistentSubchunkViewportOptions) => {
  if (!profile.expectedComparator || !Array.isArray(profile.paletteVersions) || !profile.paletteVersions.length ||
    profile.paletteVersions.length > 64 || profile.paletteVersions.some(value => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(maxSections) || maxSections < 1 || maxSections > 256)
    throw new Error("Invalid persistent subchunk viewport profile");
  if (cutawayY !== null && !Number.isSafeInteger(cutawayY)) throw new Error("Invalid terrain cutaway");
  stream.setSource(scope, createPreviewTerrainTextures(materials));
  if (cutawayY !== null) stream.setCutaway(scope, cutawayY);
  let disposed = false, revision = 0;
  let cache = new Map<string, CachedSubchunk>();
  let activeEntries = new Map<string, StreamSection>();
  let activeCoverage = new Map<string, readonly [number, number, number]>();
  const ensureCurrent = (request: number, signal: AbortSignal) => {
    if (disposed) throw cancelled("Persistent subchunk viewport loader is disposed");
    if (signal.aborted)
      throw signal.reason instanceof Error ? signal.reason : cancelled("Persistent subchunk viewport load was cancelled");
    if (request !== revision) throw cancelled("Persistent subchunk viewport load was superseded");
  };
  return {
    async load(plan: PersistentSubchunkViewportPlan, signal: AbortSignal,
      onProgress?: (progress: Readonly<PersistentSubchunkViewportProgress>) => void): Promise<PersistentSubchunkViewportResult> {
      if (!plan || !Array.isArray(plan.files) || !Array.isArray(plan.requests) || !plan.requests.length ||
        plan.requests.length > maxSections) throw new Error("Invalid persistent subchunk viewport plan");
      const request = ++revision;
      ensureCurrent(request, signal);
      const keys = plan.requests.map(item => encodePersistentSubchunkKey(item, keySchema));
      const identities = keys.map(identity);
      if (new Set(identities).size !== identities.length) throw new Error("Duplicate persistent subchunk viewport request");
      const snapshot = await loadSnapshot(plan.files, {
        expectedComparator: profile.expectedComparator,
        desiredKeys: keys,
        maxFiles,
        maxInputFiles,
        maxTotalBytes,
        maxFileBytes,
        signal,
      });
      ensureCurrent(request, signal);
      const desiredEntries = new Map<string, StreamSection>();
      const desiredCoverage = new Map<string, readonly [number, number, number]>();
      const palettes = new Map<string, readonly VoxelState[]>();
      const nextCache = new Map<string, CachedSubchunk>();
      let decodedSubchunks = 0, acceptedSections = 0, missingSubchunks = 0;
      const report = () => onProgress?.({ decodedSubchunks, totalSubchunks: plan.requests.length,
        acceptedSections, missingSubchunks });
      report();
      for (let index = 0; index < plan.requests.length; index++) {
        ensureCurrent(request, signal);
        const requested = plan.requests[index], keyIdentity = identities[index];
        const bytes = snapshot.values.get(keyIdentity);
        if (!bytes) { missingSubchunks++; report(); continue; }
        const id = JSON.stringify([requested.chunkX, requested.sectionY, requested.chunkZ]);
        const origin = [requested.chunkX * 16, requested.sectionY * 16, requested.chunkZ * 16] as const;
        let cached = cache.get(keyIdentity);
        if (!cached || !sameBytes(cached.bytes, bytes)) {
          const decoded = await pool.submit(scope, { kind: "subchunk", bytes,
            context: { schema: subchunkSchema, sectionY: requested.sectionY,
              paletteVersions: profile.paletteVersions, maxBytes: maxSubchunkBytes } }, signal);
          ensureCurrent(request, signal);
          if (decoded.kind !== "subchunk") throw new Error("Unexpected persistent subchunk worker result");
          const primary = decoded.value.layers[0]?.voxels ?? null;
          const palette = primary ? ownPalette(primary.palette) : null;
          const resources = primary ? classifyPreviewTerrainPalette(primary.palette, materials) : null;
          const sourceIncomplete = decoded.value.layers.slice(1).some(layer => containsVisibleState(layer.voxels, materials));
          cached = {
            bytes: new Uint8Array(bytes),
            origin,
            palette,
            entry: primary && resources ? { id, source: { section: primary, origin, shapes: resources.shapes },
              materials: resources.materials, sourceIncomplete } : null,
          };
        }
        if (cached.origin.some((value, axis) => value !== origin[axis]))
          throw new Error("Persistent subchunk cache identity mismatch");
        acceptedSections++; decodedSubchunks++;
        desiredCoverage.set(id, origin);
        nextCache.set(keyIdentity, cached);
        if (cached.entry) {
          desiredEntries.set(id, cached.entry);
          if (!cached.palette) throw new Error("Persistent subchunk palette is missing");
          palettes.set(id, cached.palette);
        }
        report();
      }
      ensureCurrent(request, signal);
      const remove = [...activeEntries.keys()].filter(id => !desiredEntries.has(id));
      const upsert = [...desiredEntries.values()].filter(entry => activeEntries.get(entry.id) !== entry);
      if (upsert.length || remove.length) stream.updateSections(scope, upsert, remove);
      activeEntries = desiredEntries;
      activeCoverage = desiredCoverage;
      cache = nextCache;
      const final = await stream.whenIdle();
      ensureCurrent(request, signal);
      return Object.freeze({
        decodedSubchunks,
        totalSubchunks: plan.requests.length,
        acceptedSections,
        missingSubchunks,
        root: snapshot.root,
        manifestName: snapshot.manifestName,
        bytesRead: snapshot.bytesRead,
        selectedTables: Object.freeze([...snapshot.selectedTables]),
        selectedLogs: Object.freeze([...snapshot.selectedLogs]),
        palettes,
        partialSections: final.sections.filter(section => desiredEntries.has(section.id) && section.status === "partial").length,
      });
    },
    sampleHighestLoadedVoxel(x: number, z: number) {
      if (disposed) throw new Error("Persistent subchunk viewport loader is disposed");
      if (![x, z].every(Number.isFinite)) throw new Error("Invalid terrain sample coordinate");
      const blockX = Math.floor(x), blockZ = Math.floor(z);
      if (![blockX, blockZ].every(Number.isSafeInteger)) throw new Error("Invalid terrain sample coordinate");
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
      if (disposed) throw new Error("Persistent subchunk viewport loader is disposed");
      return Object.freeze([...activeCoverage].map(([id, origin]) => Object.freeze({ id,
        origin: Object.freeze([...origin]) as readonly [number, number, number] })));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      cache.clear();
      activeEntries.clear();
      activeCoverage.clear();
    },
  };
};

export type PersistentSubchunkViewportLoader = ReturnType<typeof createPersistentSubchunkViewportLoader>;
