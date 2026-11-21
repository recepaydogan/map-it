import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { readVerifiedEquipmentItemCatalog } from "./lib/equipment-loot-profile.mjs";
import { createLogicalReviewedStoryRuleReader } from "./lib/logical-reviewed-story-rules.mjs";
import { normalizeStoryStatement } from "./lib/reviewed-story-rules.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Enrich one existing reviewed scene from original identity/equipment proof;
// keep the source actor's unresolved combat transformation out of presentation.
assert.equal(process.argv.length, 6,
  "Usage: build-scene-appearance-catalog.mjs <recipe> <base-scenes> <equipment-items> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [recipePath, basePath, equipmentPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const text = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = createHash("sha256").update(data).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Source changed: ${key}`); hashes[key] = hash; return data.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const recipe = read(recipePath), proof = read(recipe.sourceReview);
assert.equal(recipe.schemaVersion, 1);
assert(recipe.localizedEquipmentConditions?.en && recipe.localizedEquipmentConditions?.tr);
assert.equal(proof.kind, "native-impersonation-visual-source-review"); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) { text(file); assert.equal(hashes[relative(file)], hash); }
const base = readVerifiedSceneContentCatalog(basePath, root); text(basePath);
for (const file of Object.keys(base.hashes)) text(file);
const selected = base.profiles.filter((profile) => profile.id === recipe.profileId);
assert.equal(selected.length, 1); const previous = selected[0];
assert.equal(previous.characterContentId, proof.characterContentId); assert.equal(previous.anchorContentId, proof.anchorContentId);
assert(!previous.appearance && !previous.equipmentChange && !previous.localizedTitles);
assert(previous.omitAuthoredCombat && previous.deathDropsUnavailable);
const nativeRecipe = read(proof.recipePath);
assert.equal(path.resolve(root, base.inputs.recipe), path.resolve(root, proof.recipePath));
const reader = createLogicalReviewedStoryRuleReader(text);
const reviews = nativeRecipe.reviews.map((review) => reader.verify(review));
const evidence = reviews.flatMap((review) => review.evidence);
assert(evidence.some((row) => row.statement === normalizeStoryStatement(proof.equipment.call)));
assert(previous.evidence.some((row) => row.statement === normalizeStoryStatement(proof.equipment.call)));
assert(evidence.some((row) => row.statement.startsWith("Transform(") && row.statement.includes(proof.characterContentId)));
assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.mapId));
const originalContent = read(path.join(proof.stage, `public/maps/${recipe.mapId}/content.json`));
const original = originalContent.entities.filter((entity) => entity.storyDestination?.characterContentId === previous.characterContentId
  && entity.storyDestination.anchorContentId === previous.anchorContentId);
assert.equal(original.length, 1); assert(original[0].statsId);
const { catalog: equipment, items } = readVerifiedEquipmentItemCatalog(equipmentPath, root); text(equipmentPath);
for (const file of Object.keys(equipment.hashes)) text(file);
const definition = equipment.definitions[proof.equipment.definitionId]; assert(definition?.groups.length);
const entries = definition.groups.flatMap((group) => { assert.equal(group.entries.length, 1); return group.entries; });
assert.deepEqual(entries.map((row) => row.statsId), proof.equipment.items.map((row) => row.statsId));
const byId = new Map(items.map((item) => [item.id, item]));
const resolved = proof.equipment.items.map((entry) => {
  const ref = equipment.references[entry.statsId], item = byId.get(entry.itemId);
  assert.equal(ref.status, "resolved"); assert.deepEqual(ref.itemIds, [entry.itemId]);
  assert.equal(ref.rootTemplateId, entry.rootTemplateId); assert.equal(item.statsId, entry.statsId);
  assert(item.templateIds.includes(entry.rootTemplateId));
  assert.equal(text(entry.sourcePath).split(/\r?\n/)[entry.sourceLine - 1].trim(), `add equipment entry "${entry.statsId}"`);
  return { itemId: item.id, templateId: entry.rootTemplateId, statsId: item.statsId, title: item.name,
    localizedNames: item.localizedNames, amount: 1,
    evidence: [{ sourcePath: entry.sourcePath, sourceLine: entry.sourceLine, statement: `add equipment entry "${entry.statsId}"` }] };
});
const appearance = { projection: "identity-only", authoredStatsId: original[0].statsId,
  templateId: proof.nativeActor.templateId, iconId: proof.nativeActor.iconId, statsId: proof.nativeActor.targetStatsId,
  ruleId: proof.shapeRule.ruleId, sourcePath: proof.nativeActor.templatePath, ruleSourcePath: proof.shapeRule.sourcePath };
const equipmentChange = { mode: "copy-equipped", sourceCharacterContentId: proof.sourceActorId,
  definitionId: proof.equipment.definitionId, removedSlots: [], localizedConditions: recipe.localizedEquipmentConditions,
  items: resolved, evidence: previous.evidence };
const next = { ...previous, localizedTitles: proof.nativeActor.localizedNames, appearance, equipmentChange };
const profiles = base.profiles.map((profile) => profile.id === previous.id ? next : profile);
for (const file of [import.meta.filename, "scripts/lib/scene-content-profile.mjs", "scripts/lib/equipment-loot-profile.mjs",
  "scripts/lib/logical-reviewed-story-rules.mjs", "scripts/lib/reviewed-story-rules.mjs"]) text(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
writeGeneratedFile(output, `${JSON.stringify({ schemaVersion: 1, scope: "Reviewed scene identity and conditional runtime equipment copy; no inferred transformed combat or lootability.",
  inputs: { recipe: relative(recipePath), baseCatalog: relative(basePath), sourceReview: recipe.sourceReview, equipmentItems: relative(equipmentPath) },
  enrichedProfileIds: [previous.id], profiles, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ output, profiles: profiles.length, enrichedProfile: previous.id, names: next.localizedTitles, equipmentItems: resolved.length }, null, 2));
