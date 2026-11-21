import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkRevealsHiddenFeature, hasSecretFeature, worldCheckCategories } from "./lib/world-check-presentation.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "world-checks.json"));

const revealedObject = "11111111-1111-1111-1111-111111111111";
const successFlag = "22222222-2222-2222-2222-222222222222";
const revealSource = `INITSECTION
SetCanInteract(${revealedObject}, 0);
KBSECTION
IF
FlagSet(${successFlag}, _, _)
THEN
SetCanInteract(${revealedObject}, 1);`;
assert(checkRevealsHiddenFeature({ successFlagId: successFlag }, revealSource), "A proven reveal must stay in Secrets.");
assert(!checkRevealsHiddenFeature({ successFlagId: successFlag }, revealSource.replace(`SetCanInteract(${revealedObject}, 0);`, "")), "Enabling an object without hidden-state evidence is not a secret.");
assert(!checkRevealsHiddenFeature({ successFlagId: successFlag }, revealSource.replace("FlagSet(", "NOT DB_GlobalFlag(")), "A failure branch must not be treated as a successful reveal.");
assert(!checkRevealsHiddenFeature({ successFlagId: successFlag }, revealSource.replace("SetCanInteract", "// SetCanInteract")), "Commented-out evidence must not classify a secret.");

assert.equal(catalog.schemaVersion, 1, "Expected the first exact world-check catalog schema.");
assert(catalog.stats.files >= 790, `Expected at least 790 story goals; received ${catalog.stats.files}.`);
assert(catalog.stats.records >= 131, `Expected at least 131 static world checks; received ${catalog.stats.records}.`);
assert(catalog.stats.knowledgeChecks >= 68, `Expected at least 68 knowledge checks; received ${catalog.stats.knowledgeChecks}.`);
assert(catalog.stats.skillChecks >= 31, `Expected at least 31 skill checks; received ${catalog.stats.skillChecks}.`);
assert(catalog.stats.savingThrows >= 5, `Expected at least 5 saving throws; received ${catalog.stats.savingThrows}.`);
assert(catalog.stats.ambushes >= 26, `Expected at least 26 ambush registrations; received ${catalog.stats.ambushes}.`);
assert(catalog.stats.ambusherRegistrations >= 134, `Expected at least 134 exact ambusher registrations; received ${catalog.stats.ambusherRegistrations}.`);
assert.equal(catalog.stats.ambushesWithRoster, catalog.stats.ambushes, "Every extracted ambush must retain its exact enemy roster.");
assert(catalog.stats.targetObjects >= 123, `Expected at least 123 exact target objects; received ${catalog.stats.targetObjects}.`);
assert.equal(catalog.stats.unresolvedDifficulties, 0, "Every static world-check difficulty UUID must resolve.");

const categories = new Set();
for (const record of catalog.records) {
  categories.add(record.category);
  assert(record.id && record.targetObjectId && record.title, "Every world check must retain its identity, target and title.");
  assert(["knowledge-check", "skill-check", "saving-throw", "ambush"].includes(record.type), `${record.id} has unsupported type ${record.type}.`);
  assert(["secret", "puzzle", "encounter"].includes(record.category), `${record.id} has unsupported category ${record.category}.`);
  assert(record.module && record.provenance.endsWith(".txt"), `${record.id} has invalid story provenance.`);
  assert(Number.isInteger(record.sourceLine) && record.sourceLine > 0, `${record.id} has no exact source line.`);
  if (record.difficultyClassId) {
    assert(Number.isInteger(record.difficultyClass) && record.difficultyClass >= 0, `${record.id} has an unresolved or invalid DC.`);
  }
  if (record.type !== "ambush") assert(record.skill, `${record.id} has no authored skill or ability.`);
  if (record.type === "ambush" && record.detectionTriggerObjectId) {
    assert.equal(record.skill, "Perception", `${record.id} has an unexpected ambush detection skill.`);
  }
  if (record.type === "ambush") {
    assert(Array.isArray(record.ambushers) && record.ambushers.length > 0, `${record.id} has no exact ambusher roster.`);
    assert.equal(record.ambusherCount, record.ambushers.length, `${record.id} has an incorrect ambusher count.`);
    for (const ambusher of record.ambushers) {
      assert(ambusher.ambusherObjectId && ambusher.token, `${record.id} has an unidentified ambusher.`);
      assert(ambusher.provenance.endsWith(".txt"), `${record.id}:${ambusher.ambusherObjectId} has invalid roster provenance.`);
      assert(Number.isInteger(ambusher.sourceLine) && ambusher.sourceLine > 0, `${record.id}:${ambusher.ambusherObjectId} has no exact roster source line.`);
    }
  }
}
assert(categories.has("secret") && categories.has("puzzle") && categories.has("encounter"), "Expected secret, puzzle and encounter classifications.");
assert(Object.values(catalog.byTarget).some((records) => records.length > 1), "Expected at least one target with multiple static checks.");

const worldCheckEntities = [];
const worldCheckMaps = new Set();
let primaryWorldCheckMarkers = 0;
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  const locationsPath = path.join(projectRoot, "public", "maps", directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = readJson(contentPath);
  const locations = readJson(locationsPath).locations ?? [];
  const locationsByContent = new Map(locations.map((location) => [location.contentId, location]));
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.worldChecks) continue;
    const targetObjectId = entity.id.toLocaleLowerCase("en-US");
    const location = locationsByContent.get(entity.id);
    worldCheckEntities.push(entity);
    worldCheckMaps.add(directory.name);
    if (["secret", "puzzle", "encounter"].includes(entity.kind)) primaryWorldCheckMarkers += 1;
    assert(catalog.byTarget[targetObjectId], `${entity.id} has world intelligence without an exact target-object relation.`);
    assert(location, `${directory.name}:${entity.id} has no matching location.`);
    assert(entity.sourceLevel, `${directory.name}:${entity.id} has no source level.`);
    assert.equal(entity.worldChecks.checkCount, entity.worldChecks.checks.length, `${entity.id} world-check count is incorrect.`);
    assert.equal(entity.worldChecks.knowledgeCheckCount, entity.worldChecks.checks.filter((check) => check.type === "knowledge-check").length, `${entity.id} knowledge-check count is incorrect.`);
    assert.equal(entity.worldChecks.skillCheckCount, entity.worldChecks.checks.filter((check) => check.type === "skill-check").length, `${entity.id} skill-check count is incorrect.`);
    assert.equal(entity.worldChecks.savingThrowCount, entity.worldChecks.checks.filter((check) => check.type === "saving-throw").length, `${entity.id} saving-throw count is incorrect.`);
    assert.equal(entity.worldChecks.ambushCount, entity.worldChecks.checks.filter((check) => check.type === "ambush").length, `${entity.id} ambush count is incorrect.`);
    assert.deepEqual(entity.worldChecks.categories, worldCheckCategories(entity.worldChecks.checks), `${entity.id} exposes unproven world-check categories.`);
    if (location.categoryFacets?.includes("secret")) {
      assert(entity.worldChecks.categories.includes("secret"), `${entity.id} gets a secret facet from an ordinary roll.`);
    }
    if (entity.kind === "secret") assert(hasSecretFeature(entity), `${entity.id} is classified as a secret without a hidden feature.`);
    for (const category of entity.worldChecks.categories) {
      assert(location.categoryFacets?.includes(category), `${directory.name}:${entity.id} is missing its ${category} filter facet.`);
    }
    for (const check of entity.worldChecks.checks) {
      assert(catalog.byTarget[targetObjectId].some((record) => record.id === check.id), `${entity.id} exposes unknown check ${check.id}.`);
      if (check.type === "ambush") {
        assert(Array.isArray(check.ambushers) && check.ambushers.length > 0, `${entity.id}:${check.id} exposes no ambusher roster.`);
        assert.equal(check.ambusherCount, check.ambushers.length, `${entity.id}:${check.id} exposes an incorrect ambusher count.`);
        for (const ambusher of check.ambushers) {
          assert(ambusher.contentId && ambusher.title, `${entity.id}:${check.id} has an unidentified public ambusher.`);
          assert(!/^\d+$/.test(ambusher.title) && !/^wave\s*\d+$/i.test(ambusher.title), `${entity.id}:${check.id} exposes a raw editor suffix as an ambusher title: ${ambusher.title}.`);
          assert(ambusher.provenance.endsWith(".txt"), `${entity.id}:${check.id}:${ambusher.contentId} lost its roster provenance.`);
          assert(Number.isInteger(ambusher.sourceLine) && ambusher.sourceLine > 0, `${entity.id}:${check.id}:${ambusher.contentId} lost its source line.`);
        }
      }
    }
  }
}

assert(worldCheckEntities.length >= 50, `Expected world intelligence on at least 50 marker appearances; received ${worldCheckEntities.length}.`);
assert(worldCheckMaps.size >= 12, `Expected world intelligence across at least 12 maps; received ${worldCheckMaps.size}.`);
assert(worldCheckEntities.some((entity) => entity.kind === "enemy"), "Checks on enemies must preserve the enemy category.");
assert(worldCheckEntities.some((entity) => entity.kind === "interactable"), "Ordinary world interactions must remain discoverable outside Secrets.");
assert(worldCheckEntities.some((entity) => entity.worldChecks.knowledgeCheckCount > 0), "Expected a mapped knowledge check.");
assert(worldCheckEntities.some((entity) => entity.worldChecks.skillCheckCount > 0), "Expected a mapped skill check.");
assert(worldCheckEntities.some((entity) => entity.worldChecks.savingThrowCount > 0), "Expected a mapped saving throw.");
assert(worldCheckEntities.some((entity) => entity.worldChecks.ambushCount > 0), "Expected a mapped ambush.");
assert(worldCheckEntities.some((entity) => entity.worldChecks.categories.includes("puzzle")), "Expected a mapped puzzle check.");

const mappedChecks = worldCheckEntities.flatMap((entity) => entity.worldChecks.checks);
const loneDuergarAmbush = mappedChecks.find((check) => check.title === "Lone Duergar Ambush");
assert(loneDuergarAmbush, "Expected the mapped Lone Duergar ambush.");
assert.deepEqual(
  loneDuergarAmbush.ambushers.map(({ title }) => title),
  ["Gekh Coal", "Novice Garmor", "Holvik", "Lurgan"],
  "The Lone Duergar ambush must expose its four authored participants.",
);
const orthonAmbush = mappedChecks.find((check) => check.title === "Orthons Lair Ambush");
assert(orthonAmbush, "Expected the mapped Orthon's Lair ambush.");
assert.equal(orthonAmbush.ambushers.length, 9, "The Orthon's Lair ambush must expose Yurgir and eight Merregons.");
assert(orthonAmbush.ambushers.some(({ title }) => title === "Yurgir"), "The Orthon's Lair roster must include Yurgir.");
assert(!orthonAmbush.ambushers.some(({ contentId }) => contentId === "0d5e3e88-972b-4577-b6b2-b0946f38fce2"), "The Orthon's Lair roster must not misclassify the displacer beast as a hidden ambusher.");

const houseOfHopeKeyholeChecks = mappedChecks.filter((check) => check.title === "House Of Hope Secret Door Keyhole");
assert.deepEqual(
  houseOfHopeKeyholeChecks.map(({ skill, difficultyClass }) => [skill, difficultyClass])
    .sort(([left], [right]) => left.localeCompare(right, "en")),
  [["Arcana", 20], ["Wisdom", 10]],
  "The House of Hope secret keyhole must expose both authored solutions and their exact DCs.",
);
const thayanBookcaseCheck = mappedChecks.find((check) => check.title === "Thayan Cellar Book Case Investigate");
assert(thayanBookcaseCheck, "Expected the Thayan cellar bookcase investigation check.");
assert.equal(thayanBookcaseCheck.skill, "Investigation", "The Thayan cellar bookcase must retain its authored skill.");
assert.equal(thayanBookcaseCheck.difficultyClass, 10, "The Thayan cellar bookcase must retain its authored DC.");

const checkAppearances = worldCheckEntities.reduce((total, entity) => total + entity.worldChecks.checkCount, 0);
console.log(`World intelligence: ${catalog.stats.knowledgeChecks} knowledge checks / ${catalog.stats.skillChecks} skill checks / ${catalog.stats.savingThrows} saving throws / ${catalog.stats.ambushes} ambushes; ${worldCheckEntities.length} marker appearances across ${worldCheckMaps.size} maps (${primaryWorldCheckMarkers} primary markers, ${checkAppearances} check appearances).`);
