import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { createLogicalReviewedStoryRuleReader } from "./lib/logical-reviewed-story-rules.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Refine explicitly reviewed scene acquisition semantics, not the actor's
// global inventory flags. Other appearances and permanent-death exceptions stay.
assert.equal(process.argv.length, 5, "Usage: build-scene-death-availability.mjs <recipe> <base-catalog> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [recipePath, basePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const text = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const recipe = read(recipePath), base = readVerifiedSceneContentCatalog(basePath, root); text(basePath);
assert.equal(recipe.schemaVersion, 1);
for (const file of Object.keys(base.hashes)) text(file);
const reader = createLogicalReviewedStoryRuleReader(text);
const reviews = new Map(recipe.reviews.map((review) => [review.id, reader.verify(review)]));
assert.equal(reviews.size, recipe.reviews.length);
const death = reviews.get(recipe.deathReview); assert(death);
assert(death.guards.some((guard) => guard.startsWith("Died(") && guard.includes(recipe.characterContentId)));
assert(death.guards.some((guard) => guard.startsWith("NOT DB_GlobalFlag(") && guard.includes(recipe.exceptionFlagId)));
assert(death.actions.some((action) => action.startsWith("SetOnStage(") && action.includes(recipe.characterContentId) && /,\s*0\)$/.test(action)));
assert(!death.actions.some((action) => action.startsWith("SetImmortal(")), "Do not relabel death cleanup as immortality");
const selected = new Set();
for (const group of recipe.groups) {
  const sourceRecipe = read(group.sourceSceneRecipe), sourceProfile = sourceRecipe.profiles.find((profile) => profile.id === group.sourceSceneProfileId);
  assert.equal(sourceProfile?.characterContentId, recipe.characterContentId);
  assert.equal(group.contexts.length, sourceProfile.expectedAnchors);
  const entryReview = sourceRecipe.reviews.find((review) => review.id === sourceProfile.review); assert(entryReview);
  const entry = reader.verify(entryReview);
  const expected = group.contexts.map((context) => `${group.prefix}${context}`);
  const actual = base.profiles.filter((profile) => profile.id.startsWith(group.prefix));
  assert.deepEqual(actual.map((profile) => profile.id).sort(), [...expected].sort());
  for (const profile of actual) {
    assert.equal(profile.characterContentId, recipe.characterContentId);
    assert(!profile.deathDropsUnavailable && !profile.inventoryChange && !profile.equipmentChange);
    assert(entry.evidence.every((citation) => profile.evidence.some((row) => row.sourcePath === citation.sourcePath
      && row.sourceLine === citation.sourceLine && row.statement === citation.statement)));
    assert(!selected.has(profile.id)); selected.add(profile.id);
  }
}
assert(selected.size > 0);
const append = (previous, addition) => Object.fromEntries(Object.entries(previous).map(([language, value]) => {
  assert(addition[language]); return [language, `${value} ${addition[language]}`];
}));
const extraEvidence = [...reviews.values()].flatMap((review) => review.evidence);
const profiles = base.profiles.map((profile) => !selected.has(profile.id) ? profile : { ...profile,
  deathDropsUnavailable: true,
  localizedDescriptions: append(profile.localizedDescriptions, recipe.descriptionAppendix),
  lootAvailability: append(profile.lootAvailability, recipe.availabilityAppendix),
  evidence: [...new Map([...profile.evidence, ...extraEvidence].map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] });
for (const file of [import.meta.filename, "scripts/lib/logical-reviewed-story-rules.mjs", "scripts/lib/reviewed-story-rules.mjs"]) text(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
writeGeneratedFile(output, `${JSON.stringify({ schemaVersion: 1, scope: recipe.scope,
  inputs: { recipe: relative(recipePath), baseCatalog: relative(basePath) },
  enrichedProfileIds: [...selected], profiles, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), profiles: profiles.length, refinedProfiles: selected.size }));
