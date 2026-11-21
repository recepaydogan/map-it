import { GAME_BIOME_PREVIEWS, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { createBrowserStructurePool } from "../src/features/generation/create-browser-structure-pool.ts";
import { createStructureSource } from "../src/features/generation/structure-source.ts";
import { planStructureRegions } from "../src/features/generation/structure-regions.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";

const report = document.getElementById("result"), checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pass = message => { checks.push(`PASS ${message}`); report.textContent = checks.join("\n"); };
const rejected = async (promise, expected) => {
  try { await promise; } catch (error) { assert(error.code === expected, `Expected ${expected}, got ${error.code}: ${error.message}`); return; }
  throw new Error(`Expected ${expected} rejection`);
};
let source = null;
window.addEventListener("pagehide", () => source?.dispose(), { once: true });
try {
  for (const preview of GAME_BIOME_PREVIEWS) {
    const response = await fetch(`${import.meta.env.BASE_URL}${preview.url}`); assert(response.ok, "Packaged engine missing");
    const bytes = new Uint8Array(await response.arrayBuffer()); assert(bytes.length === preview.bytes, "Wrong artifact size");
    const config = { sha256: preview.sha256, profiles: preview.profiles, structures: GAME_STRUCTURE_TYPES.map(type => type.id) };
    const selection = { worldId: `structure-fixture-${preview.edition}`, edition: preview.edition, version: preview.versions.at(-1),
      seed: "8675309", dimension: 0, artifact: { bytes, config } };
    const pool = createBrowserStructurePool({ maxWorkers: 1, maxJobs: 2, timeoutMs: 15000 });
    source = createStructureSource(pool);
    try {
      let scope = source.select(selection);
      const metadata = await source.query(scope);
      const cap = metadata.capabilities.find(item => item.type === "village");
      assert(cap.regionSize === 34, "Wrong village span");
      assert(metadata.capabilities.find(item => item.type === "fortress").regionSize === null, "Wrong dimension capability");
      const planned = planStructureRegions({ minX: -1600, minZ: -1600, maxX: 1600, maxZ: 1600 }, [cap]);
      const queried = await source.query(scope, planned.queries);
      const reference = await createWasmBiomeEngine(bytes, config);
      try {
        reference.seed(selection.version, selection.seed, 0);
        for (const entry of queried.results) {
          const expected = reference.structure(entry.query.type, entry.query.regionX, entry.query.regionZ);
          assert(JSON.stringify(entry.candidate) === JSON.stringify(expected), "Worker/direct candidate mismatch");
        }
      } finally { reference.dispose(); }
      assert(queried.results.some(entry => entry.candidate?.biomeViable), "No biome-accepted fixture candidates");
      assert(queried.results.some(entry => entry.candidate && !entry.candidate.biomeViable), "Rejected attempts were lost");
      assert(bytes.length === preview.bytes && pool.getStats().pending === 0, "Ownership/queue leak");
      pass(`${preview.edition}: ${queried.results.length} native region queries, per-type span, direct comparison and unknown altitude`);

      const query = [{ type: "village", regionX: -1, regionZ: -1 }], abort = new AbortController();
      const cancelled = rejected(source.query(scope, query, abort.signal), "cancelled"); abort.abort(); await cancelled;
      assert((await source.query(scope, query)).results.length === 1, "Cancellation recovery failed");
      pass(`${preview.edition}: hard cancellation releases worker; next query recovers`);

      const old = scope, stale = rejected(source.query(scope, planned.queries), "stale");
      scope = source.select({ ...selection, worldId: `${selection.worldId}-next`, seed: "-9223372036854775808" });
      await stale; await rejected(source.query(old), "stale");
      const next = await source.query(scope, query); assert(next.results.length === 1, "Replacement world query failed");
      assert(scope.worldId !== old.worldId && scope.sourceId !== old.sourceId, "World/seed did not own result identity");
      pass(`${preview.edition}: changed world/64-bit seed invalidates late and subsequent old-scope output`);

      scope = source.select({ ...selection, dimension: -1 });
      const nether = await source.query(scope, [{ type: "village", regionX: 0, regionZ: 0 }, { type: "fortress", regionX: -1, regionZ: -1 }]);
      assert(nether.results[0].status === "unsupported", "Unsupported structure masquerades as empty terrain");
      assert(nether.capabilities.find(item => item.type === "fortress").regionSize > 0, "Missing supported dimension structure");
      pass(`${preview.edition}: dimension changes retain explicit unsupported versus queried region status`);

      scope = source.select({ ...selection, artifact: { bytes, config: { ...config, sha256: "0".repeat(64) } } });
      await rejected(source.query(scope), "worker");
      scope = source.select(selection); assert((await source.query(scope)).capabilities.length === GAME_STRUCTURE_TYPES.length, "Integrity failure poisoned source");
      pass(`${preview.edition}: artifact integrity failure and clean-source recovery`);
    } finally { source.dispose(); source = null; }
  }
  pass("All structure worker checks completed. No in-game structure accuracy claim.");
} catch (error) { source?.dispose(); report.textContent += `\nFAIL ${error.stack ?? error}`; console.error(error); }
