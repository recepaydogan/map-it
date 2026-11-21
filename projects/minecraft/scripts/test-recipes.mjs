import assert from "node:assert/strict";
import { normalizeRecipe } from "../src/features/knowledge/normalize-recipe.ts";
import { readRecipeIngredient, readRecipeOutputs } from "../src/features/knowledge/recipe-values.ts";
import { buildRecipeIndex, createRecipeTagResolver } from "../src/features/knowledge/recipe-index.ts";
import { createRecipeSubjectDisplay } from "../src/features/knowledge/recipe-subject-display.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { resolveBuiltInRecipeCatalog } from "../src/features/knowledge/built-in-recipe-catalog.ts";
import { gameKnowledgeSubjectDisplay } from "../src/features/knowledge/game-knowledge-subject-display.ts";
import { loadRemoteKnowledgeCatalogs } from "../src/features/knowledge/remote-knowledge-catalog.ts";
import { filterRecipeCatalogToItems } from "../src/features/knowledge/filter-knowledge-catalogs.ts";
import { calculateCraftingMaterials } from "../src/features/crafting/calculate-crafting-plan.ts";
import { readJavaWorldStock } from "../src/features/crafting/read-java-world-stock.ts";
import { NbtByte, NbtCompound, NbtFile, NbtList, NbtString } from "deepslate/nbt";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const checkAsync = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const flat = { edition: "edition-a", version: "1", repository: "fixture/data", revision: "a".repeat(40), recipePrefix: "recipes/", tagPrefix: "tags/",
  defaultNamespace: "fixture", dialect: "flat", recipeTypes: { "fixture:shaped": "shaped", "fixture:shapeless": "shapeless", "fixture:heat": "cooking", "fixture:cut": "cutting" },
  stations: { "fixture:shaped": ["fixture:table"], "fixture:shapeless": ["fixture:table"], "fixture:heat": ["fixture:oven"], "fixture:cut": ["fixture:cutter"] } };
const wrapped = { ...flat, edition: "edition-b", dialect: "wrapped", inactiveTags: ["retired"], stations: { table: ["fixture:table"], oven: ["fixture:oven"] } };
const file = data => ({ path: "recipes/output.json", data, sha256: "b".repeat(64) });
const shaped = () => ({ type: "fixture:shaped", key: { A: "fixture:piece", B: "#fixture:wood" }, pattern: [" A ", "BAB"], result: { id: "fixture:output", count: 2 } });
const normalize = (body, config = flat) => normalizeRecipe(file(body), config);
const unwrap = (body = shaped()) => {
  const { type, ...fields } = body;
  return { format_version: "1.0", [type]: { ...fields, description: { identifier: "fixture:output" }, tags: ["table"] } };
};
const good = result => { assert(!("code" in result), JSON.stringify(result)); return result; };

check("crafting helper groups repeated slots, scales output batches and compares aggregate world stock", () => {
  const recipe = good(normalize(shaped()));
  const stock = { schemaVersion: 1, worldId: "world", updatedAt: 1,
    player: { "fixture:piece": 2, "fixture:oak": 1 }, enderChest: { "fixture:piece": 1, "fixture:birch": 2 },
    containers: { "fixture:piece": 2, "fixture:oak": 1 },
    scannedRegionFiles: 1, availableRegionFiles: 1, scannedContainers: 1 };
  const materials = calculateCraftingMaterials(recipe, 4, stock, { "fixture:wood": ["fixture:oak", "fixture:birch"] });
  const pieces = materials.find(material => material.id === "fixture:piece");
  assert.deepEqual(pieces, { id: "fixture:piece", required: 4, owned: 5, missing: 0, alternatives: ["fixture:piece"] });
  assert.equal(materials.filter(material => material.id === "fixture:piece").length, 1);
  const wood = materials.find(material => material.id === "fixture:oak");
  assert.deepEqual(wood, { id: "fixture:oak", required: 4, owned: 4, missing: 0,
    alternatives: ["fixture:oak", "fixture:birch"] });
});

check("shaped recipes preserve empty cells, ingredient counts, provenance and output quantity", () => {
  const recipe = good(normalize(shaped()));
  assert.deepEqual(recipe.grid, { width: 3, height: 2, slots: [null, 0, null, 1, 2, 3] });
  assert.equal(recipe.ingredients.length, 4); assert.equal(recipe.outputs[0].count, 2);
  assert.equal(recipe.source.edition, flat.edition); assert.equal(recipe.source.revision, flat.revision);
  assert(recipe.source.url.includes(flat.revision)); assert.equal(recipe.source.sha256, "b".repeat(64));
});

check("wrapped rows retain implicit empty cells and explicit symmetry/priority/unlock metadata", () => {
  const raw = unwrap({ ...shaped(), key: { A: { item: "piece" } }, pattern: ["A", "AA", "AAA"] });
  raw["fixture:shaped"].assume_symmetry = false; raw["fixture:shaped"].priority = -1;
  raw["fixture:shaped"].unlock = [{ item: "piece" }];
  const recipe = good(normalize(raw, wrapped));
  assert.deepEqual(recipe.grid.slots, [0, null, null, 1, 2, null, 3, 4, 5]);
  assert.deepEqual(recipe.sourceMetadata, { formatVersion: "1.0", priority: -1, assumeSymmetry: false });
  raw["fixture:shaped"].unlock[0].item = "changed"; assert.equal(recipe.unlock[0].item, "piece");
});

check("flat recipes reject ragged grids, missing keys, unused keys and empty patterns", () => {
  for (const changes of [{ pattern: ["A", "AA"] }, { pattern: ["C"] }, { key: { ...shaped().key, C: "fixture:extra" } },
    { pattern: ["   "], key: {} }, { pattern: ["AAAA"] }]) assert.equal(normalize({ ...shaped(), ...changes }).code, "invalid");
});

check("shapeless ingredients preserve multiplicity without pretending alternatives are all required", () => {
  const recipe = good(normalize({ type: "fixture:shapeless", ingredients: ["fixture:piece", "fixture:piece", ["fixture:other", "#fixture:wood"]], result: "fixture:output" }));
  assert.equal(recipe.ingredients.length, 3); assert.equal(recipe.ingredients[2].choices.length, 2); assert.equal(recipe.grid, undefined);
  assert.equal(normalize({ type: "fixture:shapeless", ingredients: Array(10).fill("fixture:piece"), result: "fixture:output" }).code, "invalid");
});

check("item data selectors are preserved and conflicting or unsupported constraints fail", () => {
  assert.deepEqual(readRecipeIngredient("fixture:variant:4", "fixture", true), { count: 1, choices: [{ kind: "item", id: "fixture:variant", data: 4 }] });
  assert.equal(readRecipeIngredient({ item: "variant", data: 32767 }, "fixture", true).choices[0].data, 32767);
  for (const value of [{ item: "variant:4", data: 2 }, { item: "piece", tag: "wood" }, { tag: "wood", data: 0 }, { item: "piece", customCondition: true }])
    assert.throws(() => readRecipeIngredient(value, "fixture", true));
});

check("output arrays, components and variant data stay attached to their own quantities", () => {
  const components = { "fixture:attribute": "special" };
  const outputs = readRecipeOutputs([{ id: "fixture:one", count: 2, components }, { item: "fixture:two", data: 3 }], "fixture", true);
  components["fixture:attribute"] = "changed";
  assert.equal(outputs[0].components["fixture:attribute"], "special"); assert.equal(outputs[1].data, 3); assert.equal(outputs[1].count, 1);
  for (const value of [{ id: "piece", count: 0 }, { id: "piece", count: 1.5 }, { id: "piece", extra: true }, { id: "piece", item: "other" }])
    assert.throws(() => readRecipeOutputs(value, "fixture", true));
});

check("cooking duration and experience remain unknown when the source does not supply them", () => {
  const raw = { type: "fixture:heat", ingredient: "fixture:raw", result: { id: "fixture:cooked" }, cookingtime: 200, experience: 0.7 };
  assert.deepEqual(good(normalize(raw)).cooking, { ticks: 200, experience: 0.7 });
  const missing = { ...raw }; delete missing.cookingtime; delete missing.experience;
  assert.deepEqual(good(normalize(missing)).cooking, { ticks: null, experience: null });
  assert.equal(normalize({ ...raw, experience: -1 }).code, "invalid");
});

check("specialized and inactive records are explicit issues, never fabricated basic recipes", () => {
  assert.equal(normalize({ type: "fixture:special" }).code, "unsupported");
  assert.equal(normalize({ type: "fixture:transmute", input: "fixture:map", material: "fixture:paper", result: {} }, {
    ...flat, recipeTypes: { ...flat.recipeTypes, "fixture:transmute": "transmute" },
    stations: { ...flat.stations, "fixture:transmute": ["fixture:table"] },
  }).code, "unsupported");
  const raw = unwrap(); raw["fixture:shaped"].tags = ["retired"];
  assert.equal(normalize(raw, wrapped).code, "inactive");
  raw["fixture:shaped"].tags = ["unknown"]; assert.equal(normalize(raw, wrapped).code, "invalid");
});

check("nested item tags resolve alternatives with duplicate elimination", () => {
  const resolve = createRecipeTagResolver([
    { id: "fixture:wood", path: "wood", values: ["fixture:oak", "#fixture:more"] },
    { id: "fixture:more", path: "more", values: ["fixture:oak", "fixture:birch"] },
  ], "fixture");
  assert.deepEqual(resolve("fixture:wood"), { items: ["fixture:birch", "fixture:oak"], missing: [], cycles: [], complete: true });
  resolve("fixture:wood").items.length = 0; assert.equal(resolve("fixture:wood").items.length, 2);
});

check("missing and cyclic tags remain incomplete, while optional missing nested tags are allowed", () => {
  const resolve = createRecipeTagResolver([
    { id: "fixture:a", path: "a", values: ["fixture:piece", "#fixture:b", "#fixture:missing"] },
    { id: "fixture:b", path: "b", values: ["#fixture:a"] },
    { id: "fixture:optional", path: "optional", values: [{ id: "#fixture:missing", required: false }] },
  ], "fixture");
  const a = resolve("fixture:a"); assert.equal(a.complete, false); assert(a.cycles.length); assert.deepEqual(a.missing, ["fixture:missing"]);
  assert.equal(resolve("fixture:optional").complete, true); assert.equal(resolve("fixture:unknown").complete, false);
});

check("tag graph rejects duplicate identities and excessive depth", () => {
  assert.throws(() => createRecipeTagResolver([{ id: "fixture:a", values: [], path: "a" }, { id: "fixture:a", values: [], path: "b" }], "fixture"));
  const resolve = createRecipeTagResolver(Array.from({ length: 70 }, (_, index) => ({ id: `fixture:t${index}`, path: String(index), values: [`#fixture:t${index + 1}`] })), "fixture");
  assert.throws(() => resolve("fixture:t0"), /depth budget/);
});

check("forward and reverse indexes use the same recipe records and deduplicate repeated slots", () => {
  const recipe = good(normalize(shaped()));
  const resolve = createRecipeTagResolver([{ id: "fixture:wood", path: "wood", values: ["fixture:oak", "fixture:birch"] }], "fixture");
  const index = buildRecipeIndex([recipe], resolve);
  assert.deepEqual(index.produces["fixture:output"], [recipe.id]);
  assert.deepEqual(index.usesItem["fixture:piece"], [recipe.id]); assert.deepEqual(index.usesItem["fixture:oak"], [recipe.id]);
  assert.deepEqual(index.usesTag["fixture:wood"], [recipe.id]); assert.equal(Object.keys(index.unresolvedTags).length, 0);
  assert.deepEqual(index.tagMembers["fixture:wood"], ["fixture:birch", "fixture:oak"]);
});

check("recipe displays use a concrete tag member's item artwork", () => {
  const recipe = good(normalize(shaped()));
  const index = buildRecipeIndex([recipe], createRecipeTagResolver([
    { id: "fixture:wood", path: "wood", values: ["fixture:oak", "fixture:birch"] },
  ], "fixture"));
  const display = createRecipeSubjectDisplay({ recipes: [recipe], index }, (kind, id) => ({
    name: `${kind}:${id}`,
    ...(kind === "item" ? { image: `/items/${id}.png` } : {}),
  }));
  assert.deepEqual(display("tag", "fixture:wood"), {
    name: "tag:fixture:wood",
    image: "/items/fixture:birch.png",
  });
  assert.deepEqual(display("recipe", recipe.id), {
    name: "item:fixture:output",
    image: "/items/fixture:output.png",
  });
});

check("reverse indexes retain unresolved tag references without inventing member items", () => {
  const recipe = good(normalize(shaped())), index = buildRecipeIndex([recipe], createRecipeTagResolver([], "fixture"));
  assert.equal(index.unresolvedTags["fixture:wood"].complete, false);
  assert.deepEqual(index.usesTag["fixture:wood"], [recipe.id]); assert.equal(index.usesItem["fixture:oak"], undefined);
  assert.deepEqual(index.tagMembers["fixture:wood"], []);
});

check("partially resolved groups expose only known members and retain incompleteness", () => {
  const recipe = good(normalize(shaped()));
  const resolve = createRecipeTagResolver([{ id: "fixture:wood", path: "wood", values: ["fixture:oak", "#fixture:missing"] }], "fixture");
  const index = buildRecipeIndex([recipe], resolve);
  assert.deepEqual(index.tagMembers["fixture:wood"], ["fixture:oak"]);
  assert.equal(index.unresolvedTags["fixture:wood"].complete, false);
  assert.deepEqual(index.unresolvedTags["fixture:wood"].missing, ["fixture:missing"]);
  assert.deepEqual(index.usesItem["fixture:oak"], [recipe.id]);
  assert.equal(index.usesItem["fixture:missing"], undefined);
});

check("duplicate recipes and mixed edition/version/source catalogs cannot share an index", () => {
  const recipe = good(normalize(shaped())), resolve = createRecipeTagResolver([], "fixture");
  assert.throws(() => buildRecipeIndex([recipe, recipe], resolve), /Duplicate/);
  for (const patch of [{ edition: "other" }, { version: "other" }, { revision: "other" }])
    assert.throws(() => buildRecipeIndex([recipe, { ...recipe, id: "fixture:other", source: { ...recipe.source, ...patch } }], resolve), /mix/);
});

check("runtime catalog import rebuilds relationships from exact validated recipe records", () => {
  const sourceRecipe = good(normalize(shaped()));
  const raw = { schemaVersion: 2, source: { edition: flat.edition, version: flat.version, revision: flat.revision },
    recipes: [sourceRecipe], index: { produces: { "fixture:evil": ["fixture:fake"] }, usesItem: {}, usesTag: {},
      tagMembers: { "fixture:wood": ["fixture:oak", "fixture:birch"] }, unresolvedTags: {} } };
  const catalog = parseRecipeCatalogArtifact(raw, raw.source);
  assert.deepEqual(catalog.index.produces["fixture:output"], [sourceRecipe.id]); assert.equal(catalog.index.produces["fixture:evil"], undefined);
  assert.deepEqual(catalog.index.usesItem["fixture:oak"], [sourceRecipe.id]);
  sourceRecipe.outputs[0].id = "fixture:changed"; assert.equal(catalog.recipes[0].outputs[0].id, "fixture:output");
});

check("runtime catalog import fails closed on context, identity and grid corruption", () => {
  const sourceRecipe = good(normalize(shaped()));
  const artifact = () => ({ schemaVersion: 2, source: { edition: flat.edition, version: flat.version, revision: flat.revision },
    recipes: [structuredClone(sourceRecipe)], index: { tagMembers: { "fixture:wood": ["fixture:oak"] }, unresolvedTags: {} } });
  assert.throws(() => parseRecipeCatalogArtifact(artifact(), { ...artifact().source, version: "other" }), /exact edition/);
  const badId = artifact(); badId.recipes[0].outputs[0].id = "<script>";
  assert.throws(() => parseRecipeCatalogArtifact(badId, artifact().source), /identity/);
  const badGrid = artifact(); badGrid.recipes[0].grid.slots[1] = 999;
  assert.throws(() => parseRecipeCatalogArtifact(badGrid, artifact().source), /grid slot/);
  const insecure = artifact(); insecure.recipes[0].source.url = `http://example.test/${flat.revision}/recipe.json`;
  assert.throws(() => parseRecipeCatalogArtifact(insecure, artifact().source), /HTTPS revision/);
  const unpinned = artifact(); unpinned.recipes[0].source.url = "https://example.test/latest/recipe.json";
  assert.throws(() => parseRecipeCatalogArtifact(unpinned, artifact().source), /HTTPS revision/);
});

check("version item boundaries remove unavailable recipe outputs, choices and tag members", () => {
  const sourceRecipe = good(normalize(shaped()));
  const raw = { schemaVersion: 2, source: { edition: flat.edition, version: flat.version, revision: flat.revision },
    recipes: [sourceRecipe], index: { tagMembers: { "fixture:wood": ["fixture:oak", "fixture:birch"] }, unresolvedTags: {} } };
  const catalog = parseRecipeCatalogArtifact(raw, raw.source);
  const filtered = filterRecipeCatalogToItems(catalog,
    new Set(["fixture:output", "fixture:piece", "fixture:oak", "fixture:table"]));
  assert.ok(filtered);
  assert.deepEqual(filtered.index.tagMembers["fixture:wood"], ["fixture:oak"]);
  assert.equal(filtered.index.usesItem["fixture:birch"], undefined);
  assert.equal(filterRecipeCatalogToItems(catalog, new Set(["fixture:piece", "fixture:oak", "fixture:table"])), null);
});

check("the built-in exact-version recipes are pinned, indexed and illustrated", () => {
  const java20 = resolveBuiltInRecipeCatalog("java", "1.20.6"), java21 = resolveBuiltInRecipeCatalog("java", "1.21.3");
  const bedrock = resolveBuiltInRecipeCatalog("bedrock", "1.21.120");
  assert.ok(java20); assert.ok(java21);
  assert.equal(resolveBuiltInRecipeCatalog("java", "1.21.10"), null);
  assert.ok(bedrock);
  assert.equal(java20.recipes.length, 4); assert.equal(java21.recipes.length, 4);
  assert.equal(bedrock.recipes.length, 3);
  const apple20 = java20.recipes.find(recipe => recipe.id === "minecraft:golden_apple");
  const apple21 = java21.recipes.find(recipe => recipe.id === "minecraft:golden_apple");
  assert.deepEqual(apple20.grid.slots, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(apple20.ingredients.filter(item => item.choices[0].id === "minecraft:gold_ingot").length, 8);
  assert.equal(apple20.source.sha256, "1e9300ee9c3528357fa36a7aa1a859ddac2e898454a2bdb89404f4e0606a5b7b");
  assert.equal(apple21.source.sha256, "469401a796bac8972b8253e1cbb4d466cc2a5bd96ac297451ef53caa4e186f9c");
  assert.deepEqual(java20.index.produces["minecraft:sugar"],
    ["minecraft:sugar_from_honey_bottle", "minecraft:sugar_from_sugar_cane"]);
  assert.deepEqual(java20.index.usesItem["minecraft:gold_ingot"], ["minecraft:golden_apple"]);
  const sugar = java20.recipes.find(recipe => recipe.id === "minecraft:sugar_from_honey_bottle");
  assert.equal(sugar.outputs[0].count, 3);
  const ingredientArt = gameKnowledgeSubjectDisplay("item", "minecraft:gold_ingot").image;
  const recipeArt = gameKnowledgeSubjectDisplay("recipe", "minecraft:golden_apple").image;
  assert.equal(ingredientArt, "/guide-artwork/gold_ingot.png");
  assert.equal(recipeArt, "/guide-artwork/golden_apple.png");
  const saddle = bedrock.recipes.find(recipe => recipe.id === "minecraft:saddle");
  assert.deepEqual(saddle.grid, { width: 3, height: 2, slots: [null, 0, null, 1, 2, 3] });
  assert.equal(saddle.source.sha256, "ecb501560ddace3b4938f13b03b305cdbccf05d32fab48e4334cf40132c4fbac");
  assert.deepEqual(bedrock.index.produces["minecraft:saddle"], ["minecraft:saddle"]);
});

await checkAsync("remote catalogs use exact version paths, omit credentials and tolerate absent optional files", async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 404 }); };
  const catalogs = await loadRemoteKnowledgeCatalogs({ baseUrl: "https://cdn.example.test/knowledge/", edition: "bedrock",
    version: "1.21.120", recipeIdentity: { edition: "bedrock", version: "1.21.120", revision: "a".repeat(40) }, fetcher });
  assert.deepEqual(catalogs, { items: null, recipes: null, mechanics: null, biomes: null });
  assert.deepEqual(calls.map(call => call.url), [
    "https://cdn.example.test/knowledge/bedrock/1.21.120/recipes.json",
    "https://cdn.example.test/knowledge/bedrock/1.21.120/mechanics.json",
    "https://cdn.example.test/knowledge/bedrock/1.21.120/biomes.json",
  ]);
  assert(calls.every(call => call.init.credentials === "omit" && call.init.redirect === "error"));
});

await checkAsync("remote item catalogs are revision-pinned and required when a version declares one", async () => {
  const identity = { edition: "java", version: "1.18", revision: "a".repeat(40) };
  const artifact = { schemaVersion: 1, kind: "item-catalog",
    source: { ...identity, url: `https://example.test/${identity.revision}/item/data.json` }, items: ["minecraft:diamond"] };
  const fetcher = async url => url.endsWith("/items.json")
    ? new Response(JSON.stringify(artifact), { status: 200 }) : new Response(null, { status: 404 });
  const catalogs = await loadRemoteKnowledgeCatalogs({ baseUrl: "https://cdn.example.test/knowledge", ...identity,
    itemIdentity: identity, recipeIdentity: null, fetcher });
  assert.deepEqual(catalogs.items.items, ["minecraft:diamond"]);
  await assert.rejects(() => loadRemoteKnowledgeCatalogs({ baseUrl: "https://cdn.example.test/knowledge", ...identity,
    itemIdentity: identity, recipeIdentity: null, fetcher: async () => new Response(null, { status: 404 }) }), /unavailable/);
});

await checkAsync("local world stock reads player and Ender Chest item stacks without retaining save files", async () => {
  const stack = (id, count) => new NbtCompound(new Map([["id", new NbtString(id)], ["Count", new NbtByte(count)]]));
  const player = new NbtCompound(new Map([
    ["Inventory", new NbtList([stack("minecraft:oak_log", 7)], 10)],
    ["EnderItems", new NbtList([stack("minecraft:diamond", 3)], 10)],
  ]));
  const root = new NbtCompound(new Map([["Data", new NbtCompound(new Map([["Player", player]]))]]));
  const bytes = new NbtFile("", root, "gzip", false, undefined).write();
  const file = new File([bytes], "level.dat", { lastModified: 1 });
  Object.defineProperty(file, "webkitRelativePath", { value: "Fixture/level.dat" });
  const stock = await readJavaWorldStock([file], "world-1");
  assert.deepEqual(stock.player, { "minecraft:oak_log": 7 });
  assert.deepEqual(stock.enderChest, { "minecraft:diamond": 3 });
  assert.deepEqual(stock.containers, {});
  assert.equal(stock.worldId, "world-1");
});

console.log(`${checks} recipe catalog checks passed.`);
