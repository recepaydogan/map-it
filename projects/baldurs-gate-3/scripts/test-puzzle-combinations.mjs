import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "puzzle-combinations.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const entitiesById = new Map();
const relationships = new Map();

assert.equal(catalog.stats.exactCombinations, 7);
assert.equal(catalog.stats.exactObjectCombinations, 6);
assert.equal(catalog.stats.exactTemplateCombinations, 1);
for (const combination of catalog.combinations) {
  assert.match(combination.receptacle.id, /^[0-9a-f-]{36}$/);
  assert.match(combination.ingredient.id, /^[0-9a-f-]{36}$/);
  assert.ok(combination.evidence.length > 0);
  for (const evidence of combination.evidence) {
    assert.ok(evidence.statement.includes(combination.receptacle.id));
    assert.ok(evidence.statement.includes(combination.ingredient.id));
  }
}

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.puzzleCombinations) entitiesById.set(entity.id, entity);
  }
  for (const relationship of content.relationships ?? []) {
    if (relationship.kind === "inserts-into") relationships.set(relationship.id, relationship);
  }
}

const resolvedCombinations = catalog.combinations.filter(({ receptacle, ingredient }) =>
  receptacle.identityKind === "object"
  && entitiesById.has(receptacle.id)
  && entitiesById.has(ingredient.id));
assert.ok(resolvedCombinations.length >= 4, `Expected at least 4 fully mapped puzzle combinations; received ${resolvedCombinations.length}.`);
for (const combination of resolvedCombinations) {
  const receptacle = entitiesById.get(combination.receptacle.id).puzzleCombinations;
  const ingredient = entitiesById.get(combination.ingredient.id).puzzleCombinations;
  assert.equal(receptacle.role, "receptacle");
  assert.equal(ingredient.role, "ingredient");
  assert.ok(receptacle.related.some(({ contentId }) => contentId === combination.ingredient.id));
  assert.ok(ingredient.related.some(({ contentId }) => contentId === combination.receptacle.id));
  const relationship = relationships.get(combination.id);
  assert.ok(relationship, `${combination.id} has no inserts-into relationship.`);
  assert.equal(relationship.fromId, combination.ingredient.id);
  assert.equal(relationship.toId, combination.receptacle.id);
}

const silentLibraryPlaqueId = "906234ec-0dbb-48dc-ae60-74d27e6b07cc";
const nightsingerBookId = "40036615-8ed4-45cd-b554-4403bb1f6834";
assert.ok(entitiesById.get(silentLibraryPlaqueId)?.puzzleCombinations.related.some(({ contentId }) => contentId === nightsingerBookId));
assert.ok(entitiesById.get(nightsingerBookId)?.puzzleCombinations.related.some(({ contentId }) => contentId === silentLibraryPlaqueId));

const masterworkForgeId = "8515bf4e-40eb-460b-a48e-9d48cec16379";
const sussurBarkId = "ec9aee1d-4965-4620-a81a-a05ccefd8b05";
assert.ok(entitiesById.get(masterworkForgeId)?.puzzleCombinations.related.some(({ contentId }) => contentId === sussurBarkId));
assert.ok(entitiesById.get(sussurBarkId)?.puzzleCombinations.related.some(({ contentId }) => contentId === masterworkForgeId));
assert.ok([...relationships.values()].some(({ fromId, toId }) => fromId === sussurBarkId && toId === masterworkForgeId));

console.log(`Puzzle combinations: ${resolvedCombinations.length} exact two-way marker relationships verified.`);
