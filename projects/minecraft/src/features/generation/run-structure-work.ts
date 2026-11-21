import { createWasmBiomeEngine } from "./wasm-biome-engine.ts";
import type { StructureQuery, StructureWork, StructureWorkResult } from "./structure-work-types.ts";
import type { WasmBiomeEngine } from "./wasm-biome-engine.ts";

export const validateStructureQueries = (queries: readonly StructureQuery[]) => {
  if (!Array.isArray(queries) || queries.length > 64 || queries.some(query => !query || typeof query.type !== "string" || !query.type || query.type.length > 128 ||
    !Number.isSafeInteger(query.regionX) || !Number.isSafeInteger(query.regionZ) || Math.abs(query.regionX) > 1875000 || Math.abs(query.regionZ) > 1875000) ||
    new Set(queries.map(query => JSON.stringify([query.type, query.regionX, query.regionZ]))).size !== queries.length)
    throw new Error("Invalid structure region batch");
};

/** Reuse the verified WASM instance for sequential batches in one worker. */
export const createStructureWorkRunner = () => {
  let engine: WasmBiomeEngine | null = null, artifactKey: string | null = null, selectionKey: string | null = null;
  return async (work: StructureWork): Promise<StructureWorkResult> => {
    if (!work || work.kind !== "structures" || !Array.isArray(work.artifact?.config?.structures) || !work.artifact.config.structures.length)
      throw new Error("Invalid structure source artifact");
    validateStructureQueries(work.queries);
    const nextKey = JSON.stringify([work.artifact.config.sha256, work.artifact.config.profiles, work.artifact.config.structures]);
    if (!engine || artifactKey !== nextKey) {
      engine?.dispose(); engine = null; artifactKey = null; selectionKey = null;
      engine = await createWasmBiomeEngine(work.artifact.bytes, work.artifact.config);
      artifactKey = nextKey;
    }
    const currentEngine = engine;
    const nextSelectionKey = JSON.stringify([work.profile, work.seed, work.dimension]);
    if (selectionKey !== nextSelectionKey) {
      selectionKey = null;
      currentEngine.seed(work.profile, work.seed, work.dimension);
      selectionKey = nextSelectionKey;
    }
    const capabilities = work.artifact.config.structures.map(type => ({ type, regionSize: currentEngine.regionSize(type) }));
    return { kind: "structures", capabilities, results: work.queries.map(query => {
      const capability = capabilities.find(item => item.type === query.type);
      if (!capability) throw new Error("Unknown structure type");
      if (capability.regionSize === null) return { query: { ...query }, status: "unsupported", candidate: null };
      const candidate = currentEngine.structure(query.type, query.regionX, query.regionZ);
      return { query: { ...query }, status: candidate ? "candidate" : "no-attempt", candidate };
    }) };
  };
};

/** Candidate placement plus biome rules, deliberately not terrain geometry or saved-world observations. */
export const runStructureWork = createStructureWorkRunner();
