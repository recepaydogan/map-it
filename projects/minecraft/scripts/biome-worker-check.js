import { createBrowserBiomePool } from "../src/features/generation/create-browser-biome-pool.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";
import { createBiomeTileSource } from "../src/features/generation/biome-tile-source.ts";
import { GAME_SEED_ENGINE_SOURCES } from "../src/game-config.ts";
import javaUrl from "../node_modules/.cache/seed-engines/java.wasm?url";
import bedrockUrl from "../node_modules/.cache/seed-engines/bedrock.wasm?url";
import javaManifest from "../node_modules/.cache/seed-engines/java.json";
import bedrockManifest from "../node_modules/.cache/seed-engines/bedrock.json";

const result = document.getElementById("result"), checks = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const rejected = async (promise, code) => {
  try { await promise; } catch (error) { assert(error.code === code, `Expected ${code}, got ${error.code}: ${error.message}`); return; }
  throw new Error(`Expected ${code} rejection`);
};
const pass = text => { checks.push(`PASS ${text}`); result.textContent = checks.join("\n"); };
const pool = createBrowserBiomePool({ maxWorkers: 1, maxJobs: 2, timeoutMs: 15000 });
window.addEventListener("pagehide", () => pool.dispose(), { once: true });
try {
  for (const source of GAME_SEED_ENGINE_SOURCES) {
    const manifest = source.edition === "java" ? javaManifest : bedrockManifest;
    assert(manifest.revision === source.revision && manifest.archiveSha256 === source.archiveSha256, "Unpinned source manifest");
    assert(JSON.stringify(manifest.profiles) === JSON.stringify(source.profiles.map(item => item.id)), "Profile mapping mismatch");
    const response = await fetch(source.edition === "java" ? javaUrl : bedrockUrl);
    assert(response.ok, "Artifact fetch failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const config = { sha256: manifest.wasmSha256, profiles: manifest.profiles };
    const scope = { worldId: `fixture-${source.edition}`, dimension: "0", sourceId: config.sha256, revision: 1 };
    pool.setScope(scope);
    const range = { scale: 1, cellX: 0, cellZ: 0, width: 1, height: 1, blockY: 63 };
    const job = { kind: "biomes", artifact: { bytes, config }, profile: config.profiles[0], seed: "262", dimension: 0, ranges: [range] };
    const first = pool.submit(scope, job), queued = pool.submit(scope, job);
    await rejected(pool.submit(scope, job), "budget");
    const [generated] = await Promise.all([first, queued]);
    assert(generated.tiles[0].biomes[0] === 14, "Documented seed example failed");
    assert(bytes.byteLength === manifest.bytes, "Caller artifact detached");
    assert(pool.getStats().pending === 0 && pool.getStats().queuedBytes === 0, "Queue accounting leak");
    pass(`${source.edition}: native WASM output, exact profile, transferred ownership and queue limit`);

    const ranges = [1, 4].flatMap(scale => [-32, 0].map(cellX => ({ scale, cellX, cellZ: -16, width: 32, height: 16, blockY: -1 })));
    const reference = await createWasmBiomeEngine(bytes, config);
    try {
      const seed = "-9223372036854775808";
      reference.seed(job.profile, seed, 0);
      const batch = await pool.submit(scope, { ...job, seed, ranges });
      for (const tile of batch.tiles) {
        const expected = reference.generate(tile.range);
        assert(tile.biomes instanceof Uint16Array && tile.biomes.every((id, index) => id === expected[index]), "Worker batch differs from direct engine");
      }
    } finally { reference.dispose(); }
    pass(`${source.edition}: negative-coordinate tile batches match direct engine with all 64 seed bits`);

    const abort = new AbortController();
    const cancelled = rejected(pool.submit(scope, job, abort.signal), "cancelled");
    const replacement = pool.submit(scope, job); abort.abort(); await cancelled;
    assert((await replacement).tiles[0].biomes[0] === 14, "Replacement worker failed");
    pass(`${source.edition}: active cancellation and queued work recovery`);

    const stale = rejected(pool.submit(scope, job), "stale");
    const staleQueued = rejected(pool.submit(scope, job), "stale");
    const next = { ...scope, worldId: `${scope.worldId}-next`, revision: 2 }; pool.setScope(next);
    await Promise.all([stale, staleQueued]); await rejected(pool.submit(scope, job), "stale");
    assert((await pool.submit(next, job)).tiles[0].biomes[0] === 14, "New world failed");
    pass(`${source.edition}: world/revision invalidation prevents obsolete output`);

    await rejected(pool.submit(next, { ...job, artifact: { bytes, config: { ...config, sha256: "0".repeat(64) } } }), "worker");
    await rejected(pool.submit(next, { ...job, ranges: Array(17).fill(range) }), "worker");
    await rejected(pool.submit(next, { ...job, profile: "unsupported-release" }), "worker");
    assert((await pool.submit(next, job)).tiles[0].biomes[0] === 14, "Failed job poisoned following work");
    pass(`${source.edition}: integrity, version and batch errors recover without silent substitution`);

    const tileSource = createBiomeTileSource(createBrowserBiomePool({ timeoutMs: 15000 }));
    try {
      const selection = { worldId: scope.worldId, edition: source.edition, version: job.profile, seed: "262", dimension: 0, artifact: { bytes, config } };
      const selectedScope = tileSource.select(selection);
      const tiles = await tileSource.generate(selectedScope, [range]);
      assert(tiles[0].biomes[0] === 14, "Bound source does not produce the selected world");
      const oldJob = rejected(tileSource.generate(selectedScope, ranges), "stale");
      const newScope = tileSource.select({ ...selection, seed: "9223372036854775807", dimension: 1 });
      await oldJob;
      assert(newScope.sourceId !== selectedScope.sourceId && newScope.dimension === "1", "Seed/dimension binding did not change");
      assert((await tileSource.generate(newScope, ranges)).length === ranges.length, "Bound replacement source failed");
    } finally { tileSource.dispose(); }
    pass(`${source.edition}: world-bound source produces tiles and invalidates changed seed/dimension work`);
  }
  pool.dispose();
  assert(pool.getStats().workers === 0 && pool.getStats().pending === 0, "Disposal left workers");
  result.textContent += `\nPASS: ${checks.length} native compiled-biome groups; not in-game accuracy verification`;
} catch (error) { result.textContent += `\nFAIL: ${error.message}`; }
finally { pool.dispose(); }
