import { assertTerrainScope, type TerrainScope } from "../terrain/terrain-scope.ts";
import { planStructureRegions, StructureRegionLimitError, type StructureBounds } from "./structure-regions.ts";
import type { createStructureSource } from "./structure-source.ts";
import type { StructureCandidate, StructureCapability, StructureQuery, StructureQueryResult } from "./structure-work-types.ts";

export interface StructurePoint extends StructureCandidate { id: string; type: string }
export interface StructureViewportState {
  phase: "idle" | "loading" | "ready" | "paused" | "limited" | "error";
  completed: number;
  total: number;
  points: readonly Readonly<StructurePoint>[];
  unsupported: readonly string[];
  error: string | null;
}
interface Viewport { bounds: StructureBounds; types: readonly string[] | null; key: string }
interface StreamOptions { batchSize?: number; maxQueries?: number; cacheLimit?: number; deferredTypes?: readonly string[] }
const queryKey = (query: StructureQuery) => JSON.stringify([query.type, query.regionX, query.regionZ]);

/** Owns scheduling, not the source. Create a new stream for each source scope; dispose it before replacing the source. */
export const createStructureViewportStream = (
  source: Pick<ReturnType<typeof createStructureSource>, "query">,
  inputScope: TerrainScope,
  onState: (state: Readonly<StructureViewportState>) => void,
  { batchSize = 32, maxQueries = 1024, cacheLimit = 2048, deferredTypes = [] }: StreamOptions = {},
) => {
  assertTerrainScope(inputScope);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 64 || !Number.isSafeInteger(maxQueries) || maxQueries < 1 || maxQueries > 4096 ||
    !Number.isSafeInteger(cacheLimit) || cacheLimit < maxQueries || cacheLimit > 16384 || !Array.isArray(deferredTypes) || deferredTypes.length > 256 ||
    new Set(deferredTypes).size !== deferredTypes.length || deferredTypes.some(type => typeof type !== "string" || !type || type.length > 128))
    throw new Error("Invalid structure stream limits");
  const scope = Object.freeze({ ...inputScope });
  const deferred = new Set(deferredTypes);
  const cache = new Map<string, StructureQueryResult>();
  let viewport: Viewport | null = null, capabilities: StructureCapability[] | null = null;
  let plan: StructureQuery[] = [], unsupported: string[] = [];
  let active = true, disposed = false, limited = false, failure: string | null = null;
  let flight: { abort: AbortController; queries: readonly StructureQuery[] } | null = null;
  let snapshot: Readonly<StructureViewportState> = Object.freeze({ phase: "idle", completed: 0, total: 0,
    points: Object.freeze([]), unsupported: Object.freeze([]), error: null });

  const publish = () => {
    if (disposed) return;
    let completed = 0;
    const points: Readonly<StructurePoint>[] = [];
    const bounds = viewport?.bounds;
    for (const query of plan) {
      const entry = cache.get(queryKey(query));
      if (!entry) continue;
      completed++;
      const point = entry.candidate;
      if (entry.status !== "candidate" || !point?.biomeViable || !bounds || point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) continue;
      // Personal state is additionally scoped by world and dimension. Engine artifact rebuilds must not rename a point.
      points.push(Object.freeze({ ...point, type: query.type, id: JSON.stringify([query.type, point.x, point.z]) }));
    }
    snapshot = Object.freeze({ phase: !active ? "paused" : failure ? "error" : limited ? "limited" : !viewport ? "idle" :
      !capabilities || completed < plan.length ? "loading" : "ready", completed, total: plan.length,
      points: Object.freeze(points), unsupported: Object.freeze([...unsupported]), error: failure });
    onState(snapshot);
  };
  const cancel = () => { const previous = flight; flight = null; previous?.abort.abort(); };
  const replan = () => {
    plan = []; unsupported = []; limited = false;
    if (!viewport || !capabilities) return;
    try {
      if (viewport.types?.some(type => !capabilities!.some(cap => cap.type === type))) throw new Error("Unknown structure category");
      const selected = capabilities.filter(cap => viewport!.types === null || viewport!.types.includes(cap.type));
      const next = planStructureRegions(viewport.bounds, selected, maxQueries);
      plan = [...next.queries.filter(query => !deferred.has(query.type)), ...next.queries.filter(query => deferred.has(query.type))];
      unsupported = next.unsupported;
      // Refresh the viewport entries' LRU order, retaining current coverage while older batches finish.
      for (const query of plan) {
        const key = queryKey(query), entry = cache.get(key);
        if (entry) { cache.delete(key); cache.set(key, entry); }
      }
    } catch (error) {
      if (error instanceof StructureRegionLimitError) limited = true;
      else failure = error instanceof Error ? error.message : String(error);
    }
  };
  const trim = () => {
    const wanted = new Set(plan.map(queryKey));
    for (const key of cache.keys()) {
      if (cache.size <= cacheLimit) break;
      if (!wanted.has(key)) cache.delete(key);
    }
  };
  const pump = () => {
    if (disposed || !active || !viewport || failure || limited || flight) return;
    const missing = capabilities ? plan.filter(query => !cache.has(queryKey(query))) : [];
    const deferredBatch = missing[0] ? deferred.has(missing[0].type) : false;
    // Never let the tail of a quick batch pull an expensive deferred query
    // forward and delay publication of otherwise complete marker families.
    const queries = capabilities ? missing.filter(query => deferred.has(query.type) === deferredBatch).slice(0, batchSize) : [];
    if (capabilities && !queries.length) return;
    const request = { abort: new AbortController(), queries };
    flight = request;
    void (async () => {
      try {
        const result = await source.query(scope, queries, request.abort.signal);
        if (disposed || flight !== request || request.abort.signal.aborted) return;
        if (capabilities && JSON.stringify(result.capabilities) !== JSON.stringify(capabilities)) throw new Error("Structure capabilities changed within the selected source");
        capabilities = result.capabilities.map(cap => ({ ...cap }));
        for (const entry of result.results) cache.set(queryKey(entry.query), { ...entry, query: { ...entry.query }, candidate: entry.candidate && { ...entry.candidate } });
        flight = null;
        replan(); trim(); publish(); pump();
      } catch (error) {
        if (disposed || flight !== request || request.abort.signal.aborted) return;
        flight = null;
        failure = error instanceof Error ? error.message : String(error);
        publish();
      }
    })();
  };
  return {
    getState: () => snapshot,
    setViewport(bounds: StructureBounds, types: readonly string[] | null = null) {
      if (disposed) throw new Error("Structure stream is disposed");
      // Validate before replacing the last valid viewport, including while capability discovery is pending.
      planStructureRegions(bounds, [], maxQueries);
      if (types !== null && (!Array.isArray(types) || types.length > 256 || new Set(types).size !== types.length ||
        types.some(type => typeof type !== "string" || !type || type.length > 128))) throw new Error("Invalid structure categories");
      const selected = types === null ? null : [...types].sort();
      const key = JSON.stringify([bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, selected]);
      if (key === viewport?.key) return;
      viewport = { bounds: { ...bounds }, types: selected, key };
      replan();
      if (limited) cancel();
      else if (flight && capabilities) {
        const wanted = new Set(plan.map(queryKey));
        // A synchronous WASM batch for the old map area used to block every
        // marker in the new area. Keep it only when the complete batch is
        // still useful; otherwise cancellation terminates the worker and the
        // latest viewport starts immediately.
        if (flight.queries.some(query => !wanted.has(queryKey(query)))) cancel();
      }
      publish(); pump();
    },
    setActive(value: boolean) {
      if (disposed || active === value) return;
      active = value;
      if (!active) cancel();
      publish(); pump();
    },
    retry() {
      if (disposed) return;
      failure = null; replan(); publish(); pump();
    },
    dispose() { if (disposed) return; disposed = true; cancel(); cache.clear(); plan = []; viewport = null; capabilities = null; },
  };
};
