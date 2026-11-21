import { assertTerrainScope, sameTerrainScope, type TerrainScope } from "./terrain-scope.ts";
import { copyTerrainWorkData } from "./terrain-work-data.ts";
import { validateSectionSource } from "./validate-section-source.ts";
import { validateTextureArray, type TerrainDrawEntry, type TerrainTextureArray } from "./terrain-draw-data.ts";
import type { SectionMeshSource } from "./terrain-work-types.ts";
import type { TerrainWorkerPool } from "./terrain-worker-pool.ts";
import type { TerrainRenderer } from "./terrain-renderer.ts";

export interface StreamSection {
  id: string;
  source: SectionMeshSource;
  materials: TerrainDrawEntry["materials"];
  /** The source contains valid data that this renderer deliberately does not model yet. */
  sourceIncomplete?: boolean;
}
export interface StreamSectionState { id: string; status: "queued" | "meshing" | "ready" | "partial" | "failed"; deferredModels: number; error: string | null }
export interface TerrainStreamSnapshot {
  scope: Readonly<TerrainScope> | null; cutawayY: number | null; active: boolean; disposed: boolean;
  sourceBytes: number; pending: number; sections: readonly Readonly<StreamSectionState>[];
}
interface StoredSection { value: StreamSection; bytes: number; state: StreamSectionState }
export interface TerrainSectionStreamOptions {
  pool: Pick<TerrainWorkerPool, "setScope" | "submit">;
  renderer: Pick<TerrainRenderer, "setScene" | "updateEntries" | "clear" | "setActive">;
  maxSections?: number; maxSourceBytes?: number;
}
const adjacent = (left: SectionMeshSource, right: SectionMeshSource) => {
  const offsets = left.origin.map((value, axis) => Math.abs(value - right.origin[axis]));
  return offsets.filter(value => value !== 0).length === 1 && offsets.reduce((sum, value) => sum + value, 0) === 16;
};

/** Connect decoded, classified sections to bounded worker meshing and incremental GPU uploads. */
export const createTerrainSectionStream = ({ pool, renderer, maxSections = 128, maxSourceBytes = 16 * 1024 * 1024 }: TerrainSectionStreamOptions) => {
  if (!Number.isInteger(maxSections) || maxSections < 1 || maxSections > 256 || !Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > 64 * 1024 * 1024)
    throw new Error("Invalid terrain stream limits");
  const sections = new Map<string, StoredSection>(), queue = new Set<string>(), listeners = new Set<() => void>();
  let scope: TerrainScope | null = null, layers = 0, cutawayY: number | null = null, bytes = 0;
  let active = true, disposed = false, epoch = 0;
  let job: { id: string; abort: AbortController } | null = null;
  let snapshot: Readonly<TerrainStreamSnapshot>;
  const publish = () => {
    snapshot = Object.freeze({ scope: scope ? Object.freeze({ ...scope }) : null, cutawayY, active, disposed, sourceBytes: bytes,
      pending: queue.size + (job ? 1 : 0), sections: Object.freeze([...sections.values()].map(item => Object.freeze({ ...item.state }))) });
    for (const listener of listeners) listener();
  };
  const assertOpen = () => { if (disposed) throw new Error("Terrain stream is disposed"); };
  const requireScope = (requested: TerrainScope) => {
    assertOpen(); assertTerrainScope(requested);
    if (!scope || !sameTerrainScope(scope, requested)) throw new Error("Terrain stream update belongs to another source");
  };
  const cancel = () => { const previous = job; job = null; previous?.abort.abort(); };
  const queueSection = (id: string) => {
    const item = sections.get(id);
    if (!item) return;
    item.state = { id, status: "queued", deferredModels: 0, error: null }; queue.add(id);
  };
  const pump = () => {
    if (disposed || !active || job || !scope || !queue.size) return;
    const id = queue.values().next().value!; queue.delete(id);
    const item = sections.get(id)!;
    const current = { id, abort: new AbortController() }; job = current;
    const requestedScope = { ...scope };
    const neighbors = [...sections.values()].filter(other => adjacent(item.value.source, other.value.source)).map(other => other.value.source);
    item.state.status = "meshing"; publish();
    void pool.submit(requestedScope, { kind: "mesh", source: item.value.source, neighbors, cutawayY }, current.abort.signal).then(result => {
      if (disposed || job !== current || current.abort.signal.aborted) return;
      if (result.kind !== "mesh") throw new Error("Unexpected terrain stream result");
      renderer.updateEntries(requestedScope, [{ id, mesh: result.value, materials: item.value.materials }]);
      const deferredModels = result.value.deferredModelIndices.length;
      item.state = { id, status: deferredModels || item.value.sourceIncomplete ? "partial" : "ready", deferredModels, error: null };
    }).catch(error => {
      if (disposed || job !== current || current.abort.signal.aborted) return;
      item.state = { id, status: "failed", deferredModels: 0, error: error instanceof Error ? error.message : String(error) };
    }).finally(() => {
      if (job !== current) return;
      job = null; pump(); publish();
    });
  };
  const invalidate = (ids: Set<string>) => {
    if (job && ids.has(job.id)) cancel();
    for (const id of ids) queueSection(id);
    pump(); publish();
  };
  publish();
  return {
    subscribe(listener: () => void) { assertOpen(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    setSource(next: TerrainScope, textures: TerrainTextureArray) {
      assertOpen(); assertTerrainScope(next); validateTextureArray(textures);
      epoch++; cancel(); queue.clear(); sections.clear(); bytes = 0; scope = null;
      try {
        renderer.clear();
        pool.setScope(next); renderer.setScene(next, textures, []);
        scope = { ...next }; layers = textures.layers; cutawayY = null;
      } finally { publish(); }
    },
    updateSections(requested: TerrainScope, upsert: readonly StreamSection[], remove: readonly string[] = []) {
      requireScope(requested);
      if (upsert.length > maxSections || remove.length > maxSections || new Set(remove).size !== remove.length ||
        new Set(upsert.map(item => item.id)).size !== upsert.length || upsert.some(item => remove.includes(item.id)) ||
        remove.some(id => typeof id !== "string" || !id.trim() || id.length > 512)) throw new Error("Invalid terrain stream update");
      const replaced = new Set([...remove, ...upsert.map(item => item.id)]);
      if ([...sections.keys()].filter(id => !replaced.has(id)).length + upsert.length > maxSections) throw new Error("Terrain source section budget exceeded");
      const prepared: StoredSection[] = [];
      // Replacements and evictions free their source budget in the same atomic update.
      let peakBytes = [...sections.entries()].reduce((sum, [id, item]) => sum + (replaced.has(id) ? 0 : item.bytes), 0);
      for (const input of upsert) {
        const copy = copyTerrainWorkData(input, maxSourceBytes - peakBytes);
        const item = copy.value;
        if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 512 ||
          item.sourceIncomplete !== undefined && typeof item.sourceIncomplete !== "boolean")
          throw new Error("Invalid stream section identity");
        validateSectionSource(item.source);
        if (item.materials.length !== item.source.section.palette.length || item.materials.some(faces => faces.length !== 6 || faces.some(material =>
          !Number.isInteger(material.tile) || material.tile < 0 || material.tile >= layers || material.tint.length !== 3 ||
          material.tint.some(value => !Number.isFinite(value) || value < 0 || value > 1)))) throw new Error("Invalid stream section materials");
        peakBytes += copy.bytes;
        prepared.push({ value: item, bytes: copy.bytes, state: { id: item.id, status: "queued", deferredModels: 0, error: null } });
      }
      const next = new Map(sections);
      for (const id of replaced) next.delete(id);
      for (const item of prepared) next.set(item.value.id, item);
      const origins = [...next.values()].map(item => item.value.source.origin.join(","));
      if (new Set(origins).size !== origins.length) throw new Error("Duplicate terrain source origin");
      const changed = [...replaced].flatMap(id => sections.has(id) ? [sections.get(id)!.value.source] : []);
      changed.push(...prepared.map(item => item.value.source));
      const affected = new Set([...next.values()].filter(item => replaced.has(item.value.id) || changed.some(source => adjacent(source, item.value.source))).map(item => item.value.id));
      // Remove outdated geometry before scheduling; unknown/failed areas are not retained as current terrain.
      renderer.updateEntries(requested, [], [...new Set([...replaced, ...affected])].filter(id => sections.has(id)));
      if (job && replaced.has(job.id)) cancel();
      for (const id of replaced) queue.delete(id);
      sections.clear(); for (const [id, item] of next) sections.set(id, item);
      bytes = [...sections.values()].reduce((sum, item) => sum + item.bytes, 0);
      invalidate(affected);
    },
    setCutaway(requested: TerrainScope, value: number | null) {
      requireScope(requested);
      if (value !== null && !Number.isSafeInteger(value)) throw new Error("Invalid terrain cutaway");
      if (cutawayY === value) return;
      renderer.updateEntries(requested, [], [...sections.keys()]);
      cutawayY = value; invalidate(new Set(sections.keys()));
    },
    retry(requested: TerrainScope, id: string) {
      requireScope(requested);
      if (!sections.has(id)) throw new Error("Terrain section is missing");
      renderer.updateEntries(requested, [], [id]); invalidate(new Set([id]));
    },
    setActive(value: boolean) {
      assertOpen(); active = value; renderer.setActive(value);
      if (!active && job) { const id = job.id; cancel(); queueSection(id); }
      if (active) pump(); publish();
    },
    async whenIdle(): Promise<Readonly<TerrainStreamSnapshot>> {
      assertOpen(); const requestedEpoch = epoch;
      if (snapshot.pending) await new Promise<void>((resolve, reject) => {
        const observe = () => {
          if (disposed || epoch !== requestedEpoch) { listeners.delete(observe); reject(new Error("Terrain source changed while waiting")); }
          else if (!snapshot.pending) { listeners.delete(observe); resolve(); }
        };
        listeners.add(observe); observe();
      });
      const failed = snapshot.sections.find(item => item.status === "failed");
      if (failed) throw new Error(failed.error ?? "Terrain section failed");
      return snapshot;
    },
    dispose() {
      if (disposed) return;
      disposed = true; epoch++; cancel(); queue.clear(); sections.clear(); bytes = 0; scope = null;
      pool.setScope(null); renderer.clear(); publish(); listeners.clear();
    },
  };
};

export type TerrainSectionStream = ReturnType<typeof createTerrainSectionStream>;
