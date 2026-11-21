import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeRecipe } from "../src/features/knowledge/normalize-recipe.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { createSmithingGuideIndex, smithingTemplateId } from "../src/features/knowledge/smithing-guide-data.ts";

const catalog = async (edition, version) => {
  const artifact = JSON.parse(await readFile(new URL(`../public/knowledge-data/${edition}/${version}/recipes.json`, import.meta.url)));
  return parseRecipeCatalogArtifact(artifact, artifact.source);
};

const java = await catalog("java", "26.3");
const olderJava = await catalog("java", "1.20.1");
const legacyJava = await catalog("java", "1.19.4");
const bedrock = await catalog("bedrock", "26.45");
const current = createSmithingGuideIndex(java.recipes);
const old = createSmithingGuideIndex(olderJava.recipes);
const legacy = createSmithingGuideIndex(legacyJava.recipes);
const bedrockGuide = createSmithingGuideIndex(bedrock.recipes);

assert.equal(current.upgrades.size, 12);
assert.equal(current.trims.size, 18);
assert.equal(current.copies.size, 19);
assert.equal(current.subjects.size, 31);
assert.equal(old.trims.size, 16);
assert.equal(legacy.upgrades.size, 9);
assert.equal(legacy.trims.size, 0);
assert([...legacy.upgrades.values()].every(recipe => recipe.legacySmithing && recipe.ingredients.length === 2));
assert([...legacy.upgrades.values()].every(recipe => smithingTemplateId(recipe) === null));
assert.equal(bedrockGuide.upgrades.size, 12);
assert.equal(bedrockGuide.trims.size, 18);
assert.equal(bedrockGuide.copies.size, 19);
assert.equal(java.index.tagMembers["minecraft:trimmable_armor"].length, 29);
assert.equal(java.index.tagMembers["minecraft:trim_materials"].length, 11);
for (const [template, recipe] of current.trims) {
  assert(recipe, `Missing trim recipe for ${template}`);
  assert.equal(recipe.outputs.length, 0);
  assert.equal(recipe.ingredients[0].choices[0].id, template);
  assert(java.index.usesItem[template].includes(recipe.id));
  assert(current.copies.has(template), `Missing copy recipe for ${template}`);
}

const fixture = { edition: "java", version: "1", repository: "fixture/data", revision: "a".repeat(40),
  recipePrefix: "recipe/", tagPrefix: "tags/", defaultNamespace: "fixture", dialect: "flat",
  recipeTypes: { "fixture:trim": "smithing_trim" }, stations: { "fixture:trim": ["fixture:table"] } };
const trim = normalizeRecipe({ path: "recipe/trim.json", sha256: "b".repeat(64), data: {
  type: "fixture:trim", template: "fixture:template", base: "#fixture:armor", addition: "#fixture:materials",
} }, fixture);
assert(!("code" in trim), JSON.stringify(trim));
assert.deepEqual(trim.outputs, []);
assert.deepEqual(trim.smithingTrim, {});
assert.equal(trim.ingredients.length, 3);

console.log("Smithing guide catalog and dynamic trim checks passed.");
