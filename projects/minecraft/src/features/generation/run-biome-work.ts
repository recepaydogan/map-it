import { createWasmBiomeEngine } from "./wasm-biome-engine.ts";
import type { BiomeWork, BiomeWorkResult } from "./biome-work-types.ts";
import { createBiomeRelief } from "./biome-relief.ts";

const validWork = (work: BiomeWork) => work && ["biomes", "biome-relief"].includes(work.kind) && Array.isArray(work.ranges) && work.ranges.length >= 1 && work.ranges.length <= 16;
const generate = (engine: Awaited<ReturnType<typeof createWasmBiomeEngine>>, work: BiomeWork): BiomeWorkResult => work.kind === "biomes"
  ? { kind: "biomes", tiles: work.ranges.map(range => ({ range: { ...range }, biomes: engine.generate(range) })) }
  : { kind: "biome-relief", tiles: work.ranges.map(range => { const heights = engine.generateHeights(range); return { range: { ...range },
    relief: heights ? createBiomeRelief(heights, range.width, range.height, range.scale) : null }; }) };

/** A bounded batch amortizes initialization without retaining a previous world's engine state. */
export const runBiomeWork = async (work: BiomeWork): Promise<BiomeWorkResult> => {
  if (!validWork(work))
    throw new Error("Invalid biome tile batch");
  const engine = await createWasmBiomeEngine(work.artifact.bytes, work.artifact.config);
  try {
    engine.seed(work.profile, work.seed, work.dimension);
    return generate(engine, work);
  } finally { engine.dispose(); }
};

/** One runner per worker: retain only its current artifact and seeded generator. */
export const createBiomeWorkRunner = () => {
  let engine: Awaited<ReturnType<typeof createWasmBiomeEngine>> | null = null;
  let bytes: Uint8Array | null = null, identity = "";
  const dispose = () => { engine?.dispose(); engine = null; bytes = null; identity = ""; };
  return { dispose, async run(work: BiomeWork): Promise<BiomeWorkResult> {
    if (!validWork(work))
      throw new Error("Invalid biome tile batch");
    const next = JSON.stringify([work.artifact.config, work.profile, work.seed, work.dimension]);
    try {
      if (!engine || identity !== next || !bytes || bytes.length !== work.artifact.bytes.length || !bytes.every((value, index) => value === work.artifact.bytes[index])) {
        dispose();
        engine = await createWasmBiomeEngine(work.artifact.bytes, work.artifact.config);
        engine.seed(work.profile, work.seed, work.dimension);
        bytes = new Uint8Array(work.artifact.bytes); identity = next;
      }
      return generate(engine!, work);
    } catch (error) { dispose(); throw error; }
  } };
};
