import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createLogicalReviewedStoryRuleReader } from "./lib/logical-reviewed-story-rules.mjs";
import { readLocalization } from "./lib/localization.mjs";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 6, "Usage: build-scene-item-transfer-catalog.mjs <snapshot> <recipe> <base-scenes> <fresh-output>");
const root = path.resolve(import.meta.dirname, ".."), [snapshotPath, recipePath, basePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {};
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file)), snapshot = read(snapshotPath), proof = read(snapshot.proofPath);
assert.deepEqual(proof.errors, []); assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash);
// Verify the complete previous result once. The new scene catalog binds its
// relevant native sources, not every unrelated map in that previous audit.
for (const [file, expected] of Object.entries(proof.hashes)) {
  const captured = snapshot.snapshots[file]; if (captured) assert.equal(captured.hash, expected);
  assert.equal(digest(fs.readFileSync(path.resolve(root, captured?.path ?? file))), expected, `Stale baseline: ${file}`);
}
const base = read(basePath);
for (const [file, expected] of Object.entries(base.hashes)) {
  const captured = snapshot.snapshots[file]; if (captured) assert.equal(captured.hash, expected);
  assert.equal(digest(bytes(captured?.path ?? file)), expected, `Stale base scene input: ${file}`);
}
const recipe = read(recipePath); assert.equal(recipe.schemaVersion, 1);
const reader = createLogicalReviewedStoryRuleReader((file) => bytes(file).toString());
const reviews = new Map(recipe.reviews.map((review) => {
  const context = reader.verify(review); assert.deepEqual(context.actions, review.requiredActions, `Unreviewed rule action: ${review.id}`);
  return [review.id, context];
}));
assert.equal(reviews.size, recipe.reviews.length);
const items = new Map(read(snapshot.itemsPath).items.map((item) => [item.id, item]));
const localizations = {};
for (const [language, name] of [["en", "english"], ["tr", "turkish"]]) {
  const file = `map-sources/converted/localization/${name}/${name}.xml`; bytes(file); localizations[language] = readLocalization(path.join(root, file));
}
const profiles = structuredClone(base.profiles), byId = new Map(profiles.map((profile) => [profile.id, profile])), enriched = new Set();
for (const transfer of recipe.transfers) {
  const review = reviews.get(transfer.reviewId), item = items.get(transfer.itemId); assert(review && item);
  const object = read(transfer.objectSourcePath).save.regions.Templates.GameObjects.find((value) => value.MapKey?.value === transfer.objectId); assert(object);
  assert.equal(item.generation?.sourceObjectId, transfer.objectId); assert.equal(item.generation.sourcePath, transfer.objectSourcePath);
  assert(item.templateIds.includes(object.TemplateName?.value)); assert.equal(object.Stats?.value || item.generation.templateStatsId, item.statsId);
  for (const [language, values] of Object.entries(localizations)) assert.equal(item.localizedNames[language], values.get(object.DisplayName?.handle));
  assert(review.statement.startsWith("ToInventory("));
  const ids = [...review.statement.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(([id]) => id);
  assert.deepEqual(ids, [transfer.objectId, transfer.destinationContentId]);
  assert(Number.isInteger(transfer.amount) && transfer.amount > 0);
  assert(new RegExp(`,\\s*${transfer.amount},\\s*0,\\s*1\\)$`).test(review.statement));
  for (const id of transfer.profileIds) {
    const profile = byId.get(id); assert(profile && !profile.itemTransfers); assert.equal(profile.characterContentId, transfer.destinationContentId);
    // The existing independent binding proves this particular appearance.
    // Do not attach the same transfer to every appearance of the actor.
    assert(profile.evidence.some((entry) => entry.sourcePath === review.evidence[0].sourcePath
      && entry.sourceLine === recipe.reviews.find((value) => value.id === transfer.reviewId).actionLine && entry.statement === review.statement));
    profile.itemTransfers = [{ id: transfer.id, mode: "move-existing-item", objectId: transfer.objectId,
      destinationContentId: transfer.destinationContentId, localizedConditions: transfer.localizedConditions, evidence: review.evidence,
      item: { itemId: item.id, templateId: object.TemplateName.value, statsId: item.statsId, title: item.name,
        localizedNames: item.localizedNames, amount: transfer.amount, evidence: review.evidence } }];
    enriched.add(id);
  }
}
for (const file of [import.meta.filename, "scripts/lib/scene-content-profile.mjs", "scripts/lib/logical-reviewed-story-rules.mjs", "scripts/lib/localization.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected);
const catalog = { schemaVersion: 1, scope: "Existing physical item transfers at independently bound conditional scenes; no new items or loot rights.",
  inputs: { snapshot: relative(snapshotPath), recipe: relative(recipePath), baseCatalog: relative(basePath), items: relative(snapshot.itemsPath) },
  enrichedProfileIds: [...enriched], reviews: recipe.reviews.map((review) => ({ id: review.id, evidence: reviews.get(review.id).evidence })), profiles, hashes };
writeGeneratedFile(output, `${JSON.stringify(catalog, null, 2)}\n`); readVerifiedSceneContentCatalog(output, root);
console.log(JSON.stringify({ output: relative(output), profiles: profiles.length, enriched: enriched.size, sourceReviews: reviews.size, hashes: Object.keys(hashes).length }));
