import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "permanent-bonuses.json"));
const sourceRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");

assert.equal(catalog.schemaVersion, 1, "Expected the first permanent-bonus schema.");
assert.deepEqual(catalog.stats, {
  interactions: 1,
  boons: 7,
  sacrifices: 6,
  checks: 7,
  evidenceStatements: 20,
}, "Expected the complete exact Mirror of Loss evidence chain.");

const interaction = catalog.interactions.find(({ id }) => id === "mirror-of-loss");
assert(interaction, "Expected the Mirror of Loss permanent-bonus interaction.");
assert.equal(interaction.targetObjectId, "9997b20c-17de-402d-9e93-2d33249f7aaa", "Mirror placement identity drifted.");
assert.equal(interaction.dialogParticipantId, "d9907043-c08f-49bb-87d0-bb3eeb723a06", "Mirror dialogue participant drifted.");
assert.equal(interaction.dialogId, "ae1bdb66-838b-79c5-b42b-7bab5f3e1abd", "Mirror dialogue identity drifted.");
assert.equal(interaction.prayerMemoryRollBonus, 3, "Expected the exact successful-prayer memory-roll bonus.");
assert(catalog.byTarget[interaction.targetObjectId]?.some(({ id }) => id === interaction.id), "Mirror is missing from the exact target index.");

const coreAbilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
for (const ability of coreAbilities) {
  const boon = interaction.boons.find((entry) => entry.ability === ability && entry.amount === 2);
  assert(boon, `Expected the +2 ${ability} boon.`);
  assert.equal(boon.maximum, 24, `${ability} boon maximum drifted.`);
  assert.equal(boon.raw, `Ability(${ability[0].toUpperCase()}${ability.slice(1)}, 2, 24)`, `${ability} raw stat boost drifted.`);
  assert.equal(boon.statsProvenance, "Public/GustavDev/Stats/Generated/Data/Passive.txt", `${ability} boon lost exact stat provenance.`);
  assert(interaction.sacrifices.some((entry) => entry.ability === ability), `Expected the ${ability} memory sacrifice.`);
}

const minorCharisma = interaction.boons.find((entry) => entry.passiveId === "LOW_SharGrotto_Mirror_MinorCharismaBoon_Passive");
assert(minorCharisma, "Expected the minor Charisma boon.");
assert.deepEqual(
  { ability: minorCharisma.ability, amount: minorCharisma.amount, maximum: minorCharisma.maximum, raw: minorCharisma.raw },
  { ability: "charisma", amount: 1, maximum: 24, raw: "Ability(Charisma, 1, 24)" },
  "The minor Charisma boon must follow the executable raw stat rather than conflicting descriptive text.",
);

const checkRoutes = new Set(interaction.checks.map((check) => `${check.skill}:${check.difficultyClass}`));
for (const expectedRoute of ["Religion:25", "Arcana:25", "Religion:20", "Deception:20"]) {
  assert(checkRoutes.has(expectedRoute), `Missing exact Mirror dialogue route ${expectedRoute}.`);
}
assert.deepEqual(interaction.forbiddenKnowledge, {
  tagId: "673cb6af-f12b-4d6e-abfa-1bb83cf4ce44",
  passiveId: "CTY_NecromancyOfThay_ForbiddenKnowledge_Passive",
  spellId: "Target_CursedTome_WakeTheDead",
}, "Forbidden Knowledge loss identities drifted.");

for (const evidence of interaction.evidence) {
  assert(Number.isInteger(evidence.sourceLine) && evidence.sourceLine > 0, "Permanent-bonus evidence has an invalid line number.");
  const source = fs.readFileSync(path.join(sourceRoot, evidence.provenance), "utf8");
  const sourceLines = source.split(/\r?\n/);
  assert(sourceLines[evidence.sourceLine - 1]?.includes(evidence.statement), `Evidence drifted at ${evidence.provenance}:${evidence.sourceLine}.`);
  if (evidence.occurrence) {
    const matchingLines = sourceLines.flatMap((line, index) => line.includes(evidence.statement) ? [index + 1] : []);
    assert.equal(evidence.sourceLine, matchingLines[evidence.occurrence - 1], `Evidence occurrence ${evidence.occurrence} drifted.`);
  }
}

const mapId = "house-of-grief";
const content = readJson(path.join(projectRoot, "public", "maps", mapId, "content.json"));
const locations = readJson(path.join(projectRoot, "public", "maps", mapId, "locations.json")).locations ?? [];
const entity = content.entities.find(({ id }) => id === interaction.targetObjectId);
const location = locations.find(({ contentId }) => contentId === interaction.targetObjectId);
assert(entity, "Expected the exact Mirror marker on House of Grief.");
assert(location, "Expected the exact Mirror location on House of Grief.");
assert.equal(entity.kind, "permanent-upgrade", "Mirror should use the dedicated permanent-upgrade marker kind.");
assert.equal(location.category, "permanent-upgrade", "Mirror location should use the permanent-upgrade category.");
assert(location.categoryFacets?.includes("permanent-upgrade"), "Mirror is missing its permanent-upgrade filter facet.");
assert.equal(entity.permanentBonuses?.interactionCount, 1, "Mirror panel lost its permanent-bonus profile.");
assert(entity.permanentBonuses.interactions.some(({ id }) => id === interaction.id), "Mirror panel exposes the wrong permanent-bonus interaction.");
assert(entity.provenance.some(({ sourcePath }) => sourcePath.startsWith("GustavDev/Act3b_LOW_SharGrotto.txt:")), "Mirror marker lost line-addressable story-rule provenance.");

console.log(`Permanent-bonus intelligence: ${catalog.stats.interactions} interaction / ${catalog.stats.boons} boons / ${catalog.stats.checks} checks / ${catalog.stats.evidenceStatements} exact statements.`);
