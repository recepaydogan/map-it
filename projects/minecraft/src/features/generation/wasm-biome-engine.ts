import { requireNumericSeed } from "../worlds/seed-value.ts";
import { sha256Hex } from "./sha256.ts";

interface SeedExports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  engine_profile_count: () => number;
  engine_release: () => void;
  engine_seed: (profile: number, dimension: number, low: number, high: number) => number;
  engine_biome: (scale: number, x: number, y: number, z: number) => number;
  engine_generate: (scale: number, x: number, z: number, width: number, height: number, y: number) => number;
  engine_output_pointer: () => number;
  engine_output_length: () => number;
  engine_generate_heights: (scale: number, x: number, z: number, width: number, height: number) => number;
  engine_height_output_pointer: () => number;
  engine_height_output_length: () => number;
  engine_structure_count: () => number;
  engine_region_size: (type: number) => number;
  engine_structure: (type: number, regionX: number, regionZ: number) => number;
  engine_structure_x: () => number;
  engine_structure_z: () => number;
}
export interface BiomeEngineConfig { sha256: string; profiles: readonly string[]; structures?: readonly string[] }
export interface BiomeRange {
  /** Horizontal cells have this many blocks; cellX/cellZ are cell coordinates, not block coordinates. */
  scale: 1 | 4 | 16 | 64 | 256; cellX: number; cellZ: number; width: number; height: number;
  /** Caller always uses block altitude. Coarse engine queries use floor(blockY / 4). */
  blockY: number;
}
const hostNames = ["clock_time_get", "fd_close", "fd_fdstat_get", "fd_seek", "fd_write", "proc_exit"];
const functionNames = ["_initialize", "engine_profile_count", "engine_release", "engine_seed", "engine_biome", "engine_generate", "engine_output_pointer", "engine_output_length",
  "engine_generate_heights", "engine_height_output_pointer", "engine_height_output_length"];
const integer = (value: number, low: number, high: number) => Number.isSafeInteger(value) && value >= low && value <= high;

/** Runs the pinned C engine without filesystem, network, clock, random or process access. Use in a worker. */
export const createWasmBiomeEngine = async (bytes: Uint8Array, config: BiomeEngineConfig) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 4 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(config.sha256) ||
    config.profiles.length < 1 || config.profiles.length > 256 || config.profiles.some(id => !id || id.length > 128) ||
    new Set(config.profiles).size !== config.profiles.length) throw new Error("Invalid biome engine artifact or profiles");
  const profiles = [...config.profiles];
  const structures = [...(config.structures ?? [])];
  if (structures.length > 256 || structures.some(id => typeof id !== "string" || !id || id.length > 128) || new Set(structures).size !== structures.length)
    throw new Error("Invalid structure type registry");
  const owned = new Uint8Array(bytes);
  const digest = sha256Hex(owned);
  if (digest !== config.sha256) throw new Error("Biome engine integrity mismatch");
  const module = await WebAssembly.compile(owned);
  if (WebAssembly.Module.imports(module).some(item => item.module !== "wasi_snapshot_preview1" || item.kind !== "function" || !hostNames.includes(item.name)))
    throw new Error("Biome engine requests unsupported host access");
  const host = Object.fromEntries(hostNames.map(name => [name, () => { throw new Error(`Unexpected biome engine host call: ${name}`); }]));
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: host });
  if (!(instance.exports.memory instanceof WebAssembly.Memory) || functionNames.some(name => typeof instance.exports[name] !== "function"))
    throw new Error("Biome engine ABI mismatch");
  let api: SeedExports | null = instance.exports as unknown as SeedExports;
  api._initialize();
  if (api.engine_profile_count() !== profiles.length) throw new Error("Biome engine profile count mismatch");
  if (structures.length && (["engine_structure_count", "engine_region_size", "engine_structure", "engine_structure_x", "engine_structure_z"].some(name => typeof instance.exports[name] !== "function") ||
    api.engine_structure_count() !== structures.length)) throw new Error("Structure engine ABI mismatch");
  let seeded = false, dimension = 0;
  const requireOpen = () => { if (!api) throw new Error("Biome engine is disposed"); return api; };
  const requireSeed = () => { const value = requireOpen(); if (!seeded) throw new Error("Biome engine has no selected seed"); return value; };
  const structureIndex = (id: string) => { const index = structures.indexOf(id); if (index < 0) throw new Error("Unknown structure type"); return index; };
  return {
    seed(profile: string, seed: string, dim: number) {
      const current = requireOpen(); seeded = false; current.engine_release();
      const code = profiles.indexOf(profile);
      if (code < 0 || !integer(dim, -1, 1)) throw new Error("Unsupported biome profile or dimension");
      const bits = BigInt.asUintN(64, BigInt(requireNumericSeed(seed)));
      const error = current.engine_seed(code, dim, Number(bits & 0xffffffffn), Number(bits >> 32n));
      if (error) throw new Error(`Biome seed initialization failed: ${error}`);
      seeded = true; dimension = dim;
    },
    sample(scale: 1 | 4, cellX: number, cellY: number, cellZ: number) {
      const current = requireSeed();
      if (![1, 4].includes(scale) || !integer(cellX, -30000000 / scale, 30000000 / scale) ||
        !integer(cellZ, -30000000 / scale, 30000000 / scale) || !integer(cellY, -2048, 2048)) throw new Error("Invalid biome sample coordinate");
      const id = current.engine_biome(scale, cellX, cellY, cellZ);
      if (!integer(id, 0, 65535)) throw new Error("Biome engine returned no valid biome");
      return id;
    },
    generate(range: BiomeRange): Uint16Array {
      const current = requireSeed();
      const { scale, cellX, cellZ, width, height, blockY } = range;
      if (![1, 4, 16, 64, 256].includes(scale) || (dimension !== 0 && scale === 256) ||
        !integer(width, 1, 256) || !integer(height, 1, 256) || !integer(blockY, -2048, 2048) ||
        !integer(cellX, -30000000 / scale, 30000000 / scale) || !integer(cellZ, -30000000 / scale, 30000000 / scale) ||
        (cellX + width - 1) * scale > 30000000 || (cellZ + height - 1) * scale > 30000000) throw new Error("Invalid biome generation range");
      const y = scale === 1 ? blockY : Math.floor(blockY / 4);
      const error = current.engine_generate(scale, cellX, cellZ, width, height, y);
      if (error) throw new Error(`Biome tile generation failed: ${error}`);
      const pointer = current.engine_output_pointer() >>> 0, count = current.engine_output_length();
      if (!pointer || pointer % 4 || count !== width * height || current.memory.buffer.byteLength > 64 * 1024 * 1024 ||
        pointer + count * 4 > current.memory.buffer.byteLength) throw new Error("Invalid biome output buffer");
      const output = new Int32Array(current.memory.buffer, pointer, count);
      if (output.some(id => !integer(id, 0, 65535))) throw new Error("Invalid biome output identity");
      return new Uint16Array(output);
    },
    /** Approximate surface heights with a one-cell border for seam-free centered gradients. */
    generateHeights(range: BiomeRange): Float32Array | null {
      const current = requireSeed();
      if (dimension !== 0) return null;
      const { scale, cellX, cellZ, width, height } = range;
      if (![1, 4, 16, 64, 256].includes(scale) || !integer(width, 1, 256) || !integer(height, 1, 256) ||
        !integer(cellX, -30000000 / scale, 30000000 / scale) || !integer(cellZ, -30000000 / scale, 30000000 / scale) ||
        (cellX + width - 1) * scale > 30000000 || (cellZ + height - 1) * scale > 30000000) throw new Error("Invalid biome height range");
      const error = current.engine_generate_heights(scale, cellX, cellZ, width, height);
      if (error) throw new Error(`Biome height generation failed: ${error}`);
      const pointer = current.engine_height_output_pointer() >>> 0, count = current.engine_height_output_length();
      const expected = (width + 2) * (height + 2);
      if (!pointer || pointer % 4 || count !== expected || current.memory.buffer.byteLength > 64 * 1024 * 1024 ||
        pointer + count * 4 > current.memory.buffer.byteLength) throw new Error("Invalid biome height output buffer");
      const output = new Float32Array(current.memory.buffer, pointer, count);
      if (output.some(value => !Number.isFinite(value) || Math.abs(value) > 4096)) throw new Error("Invalid biome height output");
      return new Float32Array(output);
    },
    regionSize(id: string): number | null {
      const size = requireSeed().engine_region_size(structureIndex(id));
      if (!integer(size, 0, 1024)) throw new Error("Invalid structure region size");
      return size || null;
    },
    structure(id: string, regionX: number, regionZ: number) {
      const current = requireSeed(), index = structureIndex(id), span = current.engine_region_size(index) * 16;
      if (!span) throw new Error("Structure unavailable for selected profile or dimension");
      if (!integer(regionX, Math.floor(-30000000 / span), Math.floor(30000000 / span)) ||
        !integer(regionZ, Math.floor(-30000000 / span), Math.floor(30000000 / span))) throw new Error("Invalid structure region coordinate");
      const result = current.engine_structure(index, regionX, regionZ);
      if (!integer(result, 0, 2)) throw new Error(`Structure query failed: ${result}`);
      if (!result) return null;
      const x = current.engine_structure_x(), z = current.engine_structure_z();
      if (!integer(x, -30000000, 30000000) || !integer(z, -30000000, 30000000) ||
        Math.floor(x / span) !== regionX || Math.floor(z / span) !== regionZ) throw new Error("Invalid structure output coordinate");
      return { x, y: null, z, biomeViable: result === 2, terrainVerified: false as const };
    },
    dispose() { if (api) { api.engine_release(); api = null; seeded = false; } },
  };
};

export type WasmBiomeEngine = Awaited<ReturnType<typeof createWasmBiomeEngine>>;
