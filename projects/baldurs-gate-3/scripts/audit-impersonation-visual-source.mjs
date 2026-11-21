import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Inspect original source fields for the separately pending visual/equipment
// change. This is not permission to copy an impersonated actor's whole bag.
assert.equal(process.argv.length, 5, "Usage: audit-impersonation-visual-source.mjs <scene-recipe> <raw-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [recipePath, stage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const out = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(out && !out.startsWith("..") && !path.isAbsolute(out) && !fs.existsSync(output));
const hashes = {};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const recipe = read(recipePath); assert.equal(recipe.profiles.length, 1);
const profile = recipe.profiles[0], calls = recipe.reviews.flatMap((review) => review.requiredActions.map((action) => ({ review, action })))
  .filter(({ action }) => action.startsWith("CopyCharacterEquipment("));
assert.equal(calls.length, 1);
const { review, action } = calls[0], ids = action.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
assert.equal(ids.length, 2); assert.equal(ids[0], profile.characterContentId);
const nativeSource = bytes(review.sourcePath).toString("utf8").split(/\r?\n/);
assert(nativeSource.some((line) => line.trim().replace(/;$/, "") === action));
const name = action.includes(ids[1]) && review.requiredGuards[0].match(/\("([^"]+)"\)/)?.[1]; assert(name);
const registration = nativeSource.flatMap((line, index) => {
  const text = line.trim();
  return index < nativeSource.indexOf("KBSECTION") && text.startsWith("DB_WYR_OrinsImpersonation_WorldImpersonationList(") && text.includes(`"${name}"`)
    ? [{ sourcePath: review.sourcePath, sourceLine: index + 1, statement: text.split("//")[0].trim().replace(/;$/, "") }] : [];
});
assert.equal(registration.length, 1); assert(registration[0].statement.includes(ids[1]));
const contents = read(path.join(stage, "public/maps/wyrms-crossing/content.json"));
const actor = contents.entities.find(({ id }) => id === ids[1]); assert(actor);
const actorPath = "map-sources/extracted/package-placements/Mods/GustavDev/Globals/BGO_Main_A/Characters/_merged.lsj";
const original = read(actorPath).save.regions.Templates.GameObjects.find((row) => row.MapKey?.value === ids[1]); assert(original);
assert.equal(original.TemplateName.value, actor.templateId);
const templatePath = "map-sources/extracted/root-templates/Public/SharedDev/_merged.lsj";
const template = read(templatePath).save.regions.Templates.GameObjects.find((row) => row.MapKey?.value === actor.templateId); assert(template);
assert.equal(template.Icon.value, actor.iconId); assert.equal(template.Stats.value, actor.statsId);
assert.equal(template.Equipment.value, actor.authoredEquipment.definitionId);
const localizedNames = {};
for (const [language, file] of Object.entries({ en: "map-sources/converted/localization/english/english.xml", tr: "map-sources/converted/localization/turkish/turkish.xml" })) {
  const matches = [...bytes(file).toString("utf8").matchAll(/<content contentuid="([^"]+)"[^>]*>([^<]+)<\/content>/g)].filter((row) => row[1] === original.DisplayName.handle);
  assert.equal(matches.length, 1); assert(!matches[0][2].includes("&")); localizedNames[language] = matches[0][2];
}
assert.deepEqual(localizedNames, actor.localizedTitles);
const commonPath = "map-sources/extracted/story-goals/GustavDev/Act3_GEN_OrinsAbduction.txt";
const common = bytes(commonPath).toString("utf8").split(/\r?\n/);
const registrationRows = common.flatMap((line, index) => index < common.indexOf("KBSECTION") && line.trim().startsWith("DB_GEN_OrinsAbduction_OrinTransformRule_Common(")
  && line.includes("(SHAPESHIFTRULE)") ? [{ sourcePath: commonPath, sourceLine: index + 1, statement: line.trim().replace(/;$/, "") }] : []);
assert.equal(registrationRows.length, 1);
const ruleId = registrationRows[0].statement.match(/[0-9a-f-]{36}/)?.[0]; assert(ruleId);
const rulePath = "map-sources/extracted/scene-shapeshift/gustav-dev/Rulebook.lsx";
const blocks = bytes(rulePath).toString("utf8").split('<node id="Rule">').filter((block) => block.includes(`value="${ruleId}"`)); assert.equal(blocks.length, 1);
const header = blocks[0].split("<children>")[0];
const attributes = Object.fromEntries([...header.matchAll(/<attribute id="([^"]+)" type="([^"]+)" value="([^"]*)"\/>/g)].map((row) => [row[1], { type: row[2], value: row[3] }]));
assert.equal(attributes.ChangeIcon?.value, "true"); assert.equal(attributes.RetainDisplayName?.value, "false");
assert.equal(attributes.ApplyVisual?.value, "true"); assert.equal(attributes.UseShapeshiftIdentity?.value, "true");
for (const file of ["map-sources/extracted/scene-shapeshift/shared/Rulebook.lsx", "map-sources/extracted/scene-shapeshift/shared-dev/Rulebook.lsx",
  "map-sources/extracted/scene-shapeshift/gustav-x/Rulebook.lsx"]) assert(!bytes(file).toString("utf8").includes(ruleId), `Additional rule definition needs precedence review: ${file}`);
const equipmentPath = actor.authoredEquipment.groups[0].sourcePath;
const equipmentLines = bytes(equipmentPath).toString("utf8").split(/\r?\n/);
const groups = actor.authoredEquipment.groups.map((group) => {
  assert.equal(group.sourcePath, equipmentPath); assert.equal(group.entries.length, 1);
  const entry = group.entries[0]; assert.equal(equipmentLines[entry.sourceLine - 1].trim(), `add equipment entry "${entry.statsId}"`);
  return { statsId: entry.statsId, itemId: entry.itemId, rootTemplateId: entry.rootTemplateId,
    sourcePath: group.sourcePath, sourceLine: entry.sourceLine };
});
assert.equal(groups.length, 4);
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
writeGeneratedFile(output, `${JSON.stringify({ kind: "native-impersonation-visual-source-review", recipePath, stage, characterContentId: profile.characterContentId,
  anchorContentId: profile.anchorContentId, sourceActorId: ids[1], registration, nativeActor: { sourcePath: actorPath, templateId: actor.templateId,
    templatePath, iconId: actor.iconId, localizedNames, displayNameHandle: original.DisplayName.handle, targetStatsId: actor.statsId },
  shapeRule: { sourcePath: rulePath, ruleId, registration: registrationRows[0], attributes, nativeBlock: blocks[0].trim(),
    numericAbilityAndHpTypes: "Recorded verbatim; no unsupported interpretation of numeric transform enums." },
  equipment: { definitionId: actor.authoredEquipment.definitionId, items: groups, call: action,
    contractSource: "https://docs.baldursgate3.game/index.php?title=CopyCharacterEquipment",
    constraint: "Copies the source actor's runtime equipped items, not its complete authored inventory. Authored set entries do not prove unchanged runtime gear or lootability of copies." },
  hashes, errors: [], scope: "Original rule/name/icon/equipment identity evidence for a pending appearance/copied-equipment implementation. Does not apply changes, infer source-stat copy, or claim copied gear can be looted." }, null, 2)}\n`);
console.log(JSON.stringify({ output, sourceActorId: ids[1], localizedNames, ruleId, equipmentEntries: groups.length, hashes: Object.keys(hashes).length }, null, 2));
