import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { createLogicalReviewedStoryRuleReader } from "./lib/logical-reviewed-story-rules.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Extend scene presentation using an already independently reconstructed native
// binding. Cross-file tables and helper calls are not guessed by this producer.
assert.equal(process.argv.length, 6, "Usage: build-bound-arrival-scenes.mjs <recipe> <destinations> <base-scenes> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [recipePath, destinationsPath, basePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const text = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const recipe = read(recipePath), destinations = read(destinationsPath), proof = read(recipe.bindingAudit);
assert.equal(recipe.schemaVersion, 1); assert.equal(proof.kind, "story-binding-delta-audit");
assert.deepEqual(proof.errors, []); assert(Object.keys(proof.hashes).length);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(text(file)), hash, `Stale binding proof: ${file}`);
const provenRelations = read(proof.afterPath).scriptedDestinations;
const base = readVerifiedSceneContentCatalog(basePath, root); text(basePath);
for (const file of Object.keys(base.hashes)) text(file);
const reader = createLogicalReviewedStoryRuleReader(text);
const reviews = new Map(recipe.reviews.map((review) => [review.id, reader.verify(review)]));
assert.equal(reviews.size, recipe.reviews.length);
const additions = recipe.profiles.map((profile) => {
  assert.equal(profile.kind, "npc"); assert.equal(typeof profile.omitAuthoredCombat, "boolean");
  assert(profile.localizedDescriptions.en && profile.localizedDescriptions.tr && profile.lootAvailability.en && profile.lootAvailability.tr);
  assert(!profile.inventoryChange && !profile.equipmentChange && !profile.deathDropsUnavailable);
  const relation = destinations.scriptedDestinations.find((row) => row.id === profile.relationId);
  assert(relation && relation.character.id === profile.characterContentId && relation.anchor.id === profile.anchorContentId);
  assert.deepEqual(relation, provenRelations.find((row) => row.id === profile.relationId));
  const binding = proof.changes.find((row) => row.id === relation.id);
  assert(binding?.proofs.length && !binding.contradictions.length && !binding.unsupportedActions.length);
  const evidence = [...relation.evidence, ...profile.reviews.flatMap((id) => {
    assert(reviews.has(id), `Missing scene rule: ${id}`); return reviews.get(id).evidence;
  })];
  return { id: profile.id, characterContentId: profile.characterContentId, anchorContentId: profile.anchorContentId,
    kind: profile.kind, omitAuthoredCombat: profile.omitAuthoredCombat,
    localizedDescriptions: profile.localizedDescriptions, lootAvailability: profile.lootAvailability,
    evidence: [...new Map(evidence.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] };
});
const profiles = [...base.profiles, ...additions];
assert.equal(new Set(profiles.map((profile) => profile.id)).size, profiles.length);
assert.equal(new Set(profiles.map((profile) => `${profile.characterContentId}/${profile.anchorContentId}`)).size, profiles.length);
for (const file of [import.meta.filename, "scripts/lib/logical-reviewed-story-rules.mjs", "scripts/lib/reviewed-story-rules.mjs"]) text(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
writeGeneratedFile(output, `${JSON.stringify({ schemaVersion: 1,
  scope: "Bound conditional arrival presentation; original inventory retained, no new gear or lootability inferred.",
  inputs: { recipe: relative(recipePath), destinations: relative(destinationsPath), baseCatalog: relative(basePath) }, profiles, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ output, profiles: profiles.length, added: additions.length, reviewedRules: reviews.size }));
