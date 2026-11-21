import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "dialog-item-requirements.json"));

assert.equal(catalog.schemaVersion, 1, "Expected the first dialogue-item requirement schema.");
assert.equal(catalog.stats.rawCalls, 41, "Expected every authored dialogue-item registration.");
assert.equal(catalog.stats.requirements, 41, "Expected every distinct requirement tier.");
assert.equal(catalog.stats.dialogItemPairs, 38, "Expected all exact dialog-item pairs.");
assert.equal(catalog.stats.dialogs, 28, "Expected all dialog resources with item checks.");

for (const requirement of catalog.entries) {
  assert(requirement.dialogId && requirement.dialogResourceName, `${requirement.id} has no exact dialog identity.`);
  assert(requirement.itemTemplateId && requirement.itemToken, `${requirement.id} has no exact item identity.`);
  assert(Number.isInteger(requirement.scriptFlagIndex) && requirement.scriptFlagIndex > 0, `${requirement.id} has no script-flag index.`);
  assert(Number.isInteger(requirement.amount) && requirement.amount > 0, `${requirement.id} has an invalid requirement amount.`);
  assert(requirement.evidence.sourcePath.endsWith(".txt"), `${requirement.id} has invalid story provenance.`);
  assert(Number.isInteger(requirement.evidence.sourceLine) && requirement.evidence.sourceLine > 0, `${requirement.id} has no exact source line.`);
  assert(requirement.evidence.statement.startsWith("DB_HasItemTemplateScriptFlag("), `${requirement.id} lost its authored statement.`);
}

const merregonMaskTiers = catalog.entries
  .filter(({ dialogResourceName }) => dialogResourceName === "HAV_TieflingSurvivors_Weaponsmith")
  .map(({ amount }) => amount)
  .sort((left, right) => left - right);
assert.deepEqual(merregonMaskTiers, [1, 2, 3, 4], "The Dammon Merregon-mask dialogue must retain all four authored quantity tiers.");

const publicProfiles = [];
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = readJson(contentPath);
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.dialogue?.itemRequirementCount) continue;
    assert(!/^S_Player_/i.test(entity.internalName), `${directory.name}:${entity.id} incorrectly exposes another NPC's item requirements on a playable character.`);
    assert.equal(entity.dialogue.itemRequirementCount, entity.dialogue.itemRequirements.length, `${directory.name}:${entity.id} has an incorrect requirement count.`);
    for (const requirement of entity.dialogue.itemRequirements) {
      assert(requirement.id && requirement.itemTemplateId && requirement.title, `${directory.name}:${entity.id} has an unidentified dialogue item.`);
      assert(!/^(?:ALCH|CONS?|LOOT|QUEST|UNI|OBJ|TOOL|GRN|DOS2|MAG)\b/i.test(requirement.title), `${directory.name}:${entity.id} exposes a raw item prefix: ${requirement.title}.`);
      assert(requirement.evidence.length > 0, `${directory.name}:${entity.id}:${requirement.id} has no exact evidence.`);
    }
    publicProfiles.push({ mapId: directory.name, entity });
  }
}

assert.equal(publicProfiles.length, 0, "The public map-content contract intentionally omits dialogue profiles.");
for (const [dialogResourceName, itemTemplateId] of [
  ["GOB_VoloBallad_Volo_InCage", "809d5026-4896-4b3a-986e-95da58da77e2"],
  ["FOR_UnfortunateGnome", "278271f9-3fbc-4cf7-a5dc-b36527f521b2"],
]) {
  assert.ok(catalog.entries.some((entry) => entry.dialogResourceName === dialogResourceName && entry.itemTemplateId === itemTemplateId),
    `${dialogResourceName} retains its authored item requirement in the source catalog`);
}

console.log(`Dialogue item requirements: ${catalog.stats.requirements} authored tiers / ${catalog.stats.dialogItemPairs} item pairs; ${publicProfiles.length} mapped marker profiles.`);
