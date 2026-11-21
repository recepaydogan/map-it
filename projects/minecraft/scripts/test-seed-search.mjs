import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_BIOME_PREVIEWS, GAME_CURATED_WORLD_PICKS, GAME_SEED_SEARCH_PROFILES, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { evaluateSeedCandidates, planSeedSearchRegions, validateSeedSearchRequest } from "../src/features/generation/run-seed-search-work.ts";
import { createSeedSearchSource } from "../src/features/generation/seed-search-source.ts";
import { sha256Hex } from "../src/features/generation/sha256.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";
import { curatedWorldPicksFor, curatedWorldPreviewPath, resolveCuratedWorldPick } from "../src/features/worlds/world-curated-seeds.ts";
import { renderCuratedWorldPreview } from "./curated-preview-image.mjs";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };

const engine = (responses, unsupported = [], biomeAt = () => 0) => {
  let seed = "";
  return {
    seed(_profile, value) { seed = value; },
    regionSize(type) { return unsupported.includes(type) ? null : 32; },
    structure(type, regionX, regionZ) {
      const point = responses[`${seed}:${type}`];
      return point && Math.floor(point.x / 512) === regionX && Math.floor(point.z / 512) === regionZ ? { ...point } : null;
    },
    generate(range) {
      const result = new Uint16Array(range.width * range.height);
      for (let row = 0; row < range.height; row++) for (let column = 0; column < range.width; column++) {
        result[row * range.width + column] = biomeAt(seed,
          (range.cellX + column) * range.scale, (range.cellZ + row) * range.scale);
      }
      return result;
    },
  };
};

await check("runtime SHA-256 works without WebCrypto and enforces its input bound", () => {
  assert.equal(sha256Hex(new Uint8Array()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.throws(() => sha256Hex(new Uint8Array(4 * 1024 * 1024 + 1)), /input/);
});

await check("region planning covers negative origin boundaries center-first and fails before oversized allocation", () => {
  const regions = planSeedSearchRegions(512, 32);
  assert.deepEqual(new Set(regions.map(entry => `${entry.regionX},${entry.regionZ}`)), new Set(["-1,-1", "0,-1", "-1,0", "0,0", "1,-1", "1,0", "-1,1", "0,1", "1,1"]));
  assert.deepEqual(regions[0], { regionX: -1, regionZ: -1 });
  assert.throws(() => planSeedSearchRegions(4096, 1), /query budget/);
});

await check("search requires every configured structure and preserves the exact signed seed", () => {
  const result = evaluateSeedCandidates(engine({
    "-2:village": { x: 150, y: null, z: 100, biomeViable: true, terrainVerified: false },
    "-1:village": { x: 100, y: null, z: 100, biomeViable: true, terrainVerified: false },
    "-1:portal": { x: -120, y: null, z: 80, biomeViable: true, terrainVerified: false },
  }), "v1", ["-2", "-1"], 0, [{ type: "village", radius: 512 }, { type: "portal", radius: 512 }]);
  assert.equal(result.status, "match"); assert.equal(result.evaluated, 2); assert.equal(result.match.seed, "-1");
  assert.deepEqual(result.match.points.map(point => point.type), ["village", "portal"]);
});

await check("biome-rejected and outside-radius placements never become a match", () => {
  const result = evaluateSeedCandidates(engine({
    "1:village": { x: 20, y: null, z: 20, biomeViable: false, terrainVerified: false },
    "2:village": { x: 400, y: null, z: 400, biomeViable: true, terrainVerified: false },
  }), "v1", ["1", "2"], 0, [{ type: "village", radius: 512 }]);
  assert.equal(result.status, "none"); assert.equal(result.evaluated, 2); assert.equal(result.match, null);
});

await check("combined search requires configured biome coverage as well as every structure", () => {
  const result = evaluateSeedCandidates(engine({
    "1:village": { x: 32, y: null, z: 32, biomeViable: true, terrainVerified: false },
    "2:village": { x: 64, y: null, z: -64, biomeViable: true, terrainVerified: false },
  }, [], (seed, x, z) => seed === "2" && Math.hypot(x, z) >= 64 ? 179 : 1), "v1", ["1", "2"], 0, [
    { kind: "structure", type: "village", radius: 512 },
    { kind: "biome", type: "snowy-mountains", biomeIds: [179, 180, 181], radius: 256,
      innerRadius: 64, scale: 64, blockY: 96, minSectors: 4 },
  ]);
  assert.equal(result.status, "match"); assert.equal(result.evaluated, 2);
  assert.deepEqual(result.match.points.map(point => point.kind), ["structure", "biome"]);
  assert.equal(result.match.points[1].biomeId, 179);
  assert.ok(result.match.points[1].matchedSectors >= 4);
});

await check("unsupported structure capability is explicit and evaluates no seeds", () => {
  const result = evaluateSeedCandidates(engine({}, ["fortress"]), "v1", ["1"], -1, [{ type: "fortress", radius: 512 }]);
  assert.deepEqual(result, { kind: "seed-search", status: "unsupported", evaluated: 0, unsupported: ["fortress"], match: null });
});

await check("candidate and requirement limits reject invalid or ambiguous work", () => {
  for (const candidates of [[], ["01"], ["1", "1"], ["9223372036854775808"]])
    assert.throws(() => validateSeedSearchRequest(candidates, [{ type: "village", radius: 512 }]));
  for (const requirements of [[], [{ type: "village", radius: 1 }], [{ type: "village", radius: 512 }, { type: "village", radius: 1024 }],
    [{ kind: "biome", type: "snow", biomeIds: [], radius: 512, innerRadius: 0, scale: 64, blockY: 96, minSectors: 1 }],
    [{ kind: "biome", type: "snow", biomeIds: [179], radius: 512, innerRadius: 512, scale: 64, blockY: 96, minSectors: 1 }]])
    assert.throws(() => validateSeedSearchRequest(["1"], requirements));
  assert.throws(() => evaluateSeedCandidates(engine({}), "v1", Array.from({ length: 256 }, (_, index) => String(index)), 0,
    [{ kind: "biome", type: "snow", biomeIds: [179], radius: 4096, innerRadius: 0, scale: 16, blockY: 96, minSectors: 1 }]), /biome sample budget/);
});

const selection = () => ({ worldId: "search-fixture", edition: "edition-a", version: "v1", dimension: 0,
  artifact: { bytes: new Uint8Array([0, 97, 115, 109]), config: { sha256: "a".repeat(64), profiles: ["v1"], structures: ["village"] } } });
const sourceFixture = () => {
  const requests = [];
  const source = createSeedSearchSource({ setScope() {}, dispose() {}, submit(scope, work) {
    return new Promise((resolve, reject) => requests.push({ scope, work, resolve, reject }));
  } });
  return { source, requests };
};

await check("source owns inputs and accepts only a result matching the requested candidate", async () => {
  const fixture = sourceFixture(), scope = fixture.source.select(selection());
  const candidates = ["-9"], requirements = [{ type: "village", radius: 512 }];
  const pending = fixture.source.search(scope, candidates, requirements); candidates[0] = "3"; requirements[0].radius = 1024;
  assert.equal(fixture.requests[0].work.candidates[0], "-9"); assert.equal(fixture.requests[0].work.requirements[0].radius, 512);
  fixture.requests[0].resolve({ kind: "seed-search", status: "match", evaluated: 1, unsupported: [],
    match: { seed: "-9", points: [{ kind: "structure", type: "village", x: 10, y: null, z: -20, biomeViable: true, terrainVerified: false }] } });
  assert.equal((await pending).match.seed, "-9"); fixture.source.dispose();
});

await check("source rejects fabricated result coordinates and stale contexts", async () => {
  const fixture = sourceFixture(), scope = fixture.source.select(selection());
  const pending = assert.rejects(fixture.source.search(scope, ["1"], [{ type: "village", radius: 512 }]), error => error?.code === "protocol");
  fixture.requests[0].resolve({ kind: "seed-search", status: "match", evaluated: 1, unsupported: [],
    match: { seed: "1", points: [{ kind: "structure", type: "village", x: 500, y: null, z: 500, biomeViable: true, terrainVerified: false }] } });
  await pending; fixture.source.select({ ...selection(), version: "v1" });
  await assert.rejects(fixture.source.search(scope, ["1"], [{ type: "village", radius: 512 }]), error => error?.code === "stale");
  fixture.source.dispose();
});

await check("curated picks resolve only inside their exact generator context", () => {
  assert.equal(new Set(GAME_CURATED_WORLD_PICKS.map(pick => pick.id)).size, GAME_CURATED_WORLD_PICKS.length);
  assert.deepEqual(curatedWorldPicksFor("java", "1.21.10", "default"), []);
  assert.equal(resolveCuratedWorldPick("snowy-cherry-village", "java", "1.21.3", "default")?.seed, "35");
  assert.equal(resolveCuratedWorldPick("snowy-cherry-village", "java", "1.18.2", "default"), null);
  assert.equal(resolveCuratedWorldPick("snowy-cherry-village", "bedrock", "1.21.60", "flat"), null);
});

await check("packaged Java and Bedrock profiles verify the combined fixture and every curated pick", async () => {
  const searchProfile = GAME_SEED_SEARCH_PROFILES.find(profile => profile.id === "snowy-cherry-village");
  assert.ok(searchProfile);
  const candidates = Array.from({ length: 36 }, (_, index) => String(index));
  for (const [edition, versions] of [["java", ["1.20.6", "1.21.3"]], ["bedrock", ["1.21.50", "1.21.60"]]]) {
    const config = GAME_BIOME_PREVIEWS.find(candidate => candidate.edition === edition);
    assert.ok(config);
    const bytes = new Uint8Array(await readFile(new URL(`../public/${config.url}`, import.meta.url)));
    const actual = await createWasmBiomeEngine(bytes, { sha256: config.sha256, profiles: config.profiles,
      structures: GAME_STRUCTURE_TYPES.map(type => type.id) });
    try {
      for (const version of versions) {
        const result = evaluateSeedCandidates(actual, version, candidates, 0, searchProfile.requirements);
        assert.equal(result.status, "match"); assert.equal(result.match.seed, "35");
        assert.deepEqual(result.match.points.map(point => point.kind), ["structure", "biome", "biome"]);
        assert.equal(result.match.points[1].matchedSectors, 3);
        assert.equal(result.match.points[2].biomeId, 185);
      }
      for (const version of config.versions) {
        for (const pick of curatedWorldPicksFor(edition, version, "default")) {
          const profile = GAME_SEED_SEARCH_PROFILES.find(candidate => candidate.id === pick.profileId);
          assert.ok(profile, `Missing curated profile ${pick.profileId}`);
          const dimension = profile.dimension === "nether" ? -1 : profile.dimension === "end" ? 1 : 0;
          const verified = evaluateSeedCandidates(actual, version, [pick.seed], dimension, profile.requirements);
          assert.equal(verified.status, "match", `${pick.id} is not valid for ${edition} ${version}`);
          assert.equal(verified.match.seed, pick.seed);
          assert.deepEqual(verified.match.points.map(point => point.type), profile.requirements.map(requirement => requirement.type));
          const rendered = await renderCuratedWorldPreview(actual, pick, version);
          const committed = await readFile(new URL(`../public/${curatedWorldPreviewPath(pick, edition, version)}`, import.meta.url));
          assert.equal(Buffer.compare(rendered, committed), 0, `Curated preview is stale for ${edition} ${version} ${pick.id}`);
        }
      }
    } finally { actual.dispose(); }
  }
});

console.log(`${checks} seed search checks passed.`);
