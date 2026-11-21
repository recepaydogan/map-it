import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "corpse-dialogs.json"));

assert.equal(catalog.schemaVersion, 1, "Expected the exact corpse-dialog catalog schema.");
assert(catalog.stats.relations >= 140, `Expected at least 140 exact corpse-dialog relations; received ${catalog.stats.relations}.`);
assert(catalog.stats.uniqueCharacters >= 135, `Expected at least 135 entities with authored corpse dialogue; received ${catalog.stats.uniqueCharacters}.`);
assert(catalog.stats.conditionalRelations >= 16, `Expected at least 16 conditionally registered corpse dialogues; received ${catalog.stats.conditionalRelations}.`);
assert.equal(catalog.stats.customEntityRelations, 2, "Expected the Orthon bed and Gortash custom corpse-dialog entities.");
assert(catalog.stats.matchedRelations >= 135, `Expected at least 135 exact story-to-dialog filename matches; received ${catalog.stats.matchedRelations}.`);
assert(catalog.stats.profiledCharacters >= 130, `Expected at least 130 exact entity profiles; received ${catalog.stats.profiledCharacters}.`);
assert(catalog.stats.localizedQuestions >= 1_050, `Expected at least 1,050 localized questions; received ${catalog.stats.localizedQuestions}.`);
assert.equal(catalog.stats.ambiguousRelations, 0, "No corpse-dialog resource name should resolve ambiguously.");

const lastJusticiar = catalog.byCharacterId["594ba359-ce55-4b54-9efc-94eca306c540"];
assert(lastJusticiar, "Expected an exact Speak with Dead profile for the Last Justiciar.");
assert.equal(lastJusticiar.dialogs[0].dialogInternalName, "SHA_LastJusticiar_SpeakWithDead");
assert(lastJusticiar.dialogs[0].questions.some(({ localizedText }) => localizedText.en === "What brought you to this place?"),
  "Expected the Last Justiciar's exact localized question text.");
assert(lastJusticiar.dialogs[0].evidence.some(({ statement }) => statement.startsWith("DB_GLO_CharacterCorpseDialog(")),
  "Expected the profile to retain its exact story evidence.");

const unmatchedNames = new Set(catalog.unmatchedRelations.map(({ dialogInternalName }) => dialogInternalName));
assert(unmatchedNames.has("PLA_ZhentShipment_Agent_001_SpeakWithDead"),
  "Expected the renamed Zhent corpse dialogue to remain conservatively unmatched.");

const gortash = catalog.byCharacterId["b878a854-f790-4999-95c4-3f20f00f65ac"];
assert.equal(gortash?.dialogs[0]?.predicate, "DB_GLO_CustomEntityCorpseDialog", "Expected Gortash's custom corpse entity to resolve exactly.");
assert(gortash.dialogs[0].questions.some(({ localizedText }) => localizedText.en === "Why did you ally with Myrkul and Bhaal?"),
  "Expected Gortash's exact Speak with Dead prompt.");

for (const profile of Object.values(catalog.byCharacterId)) {
  assert(profile.characterId && profile.dialogs.length > 0, "Every corpse-dialog profile must retain its exact character identity.");
  assert.equal(profile.dialogCount, profile.dialogs.length, `${profile.characterId} has an incorrect dialog count.`);
  for (const dialog of profile.dialogs) {
    assert(dialog.dialogResourceId && dialog.dialogInternalName, `${profile.characterId} contains an unidentified dialogue resource.`);
    assert(dialog.provenance.endsWith(".lsj"), `${dialog.dialogInternalName} lost its exact dialog provenance.`);
    assert(dialog.evidence.length > 0, `${dialog.dialogInternalName} lost its exact story relation.`);
    for (const question of dialog.questions) {
      assert(question.id && question.localizedText?.en, `${dialog.dialogInternalName} contains an unidentified question.`);
      assert(!question.localizedText.en.startsWith("h"), `${question.id} exposes a localization handle instead of text.`);
      assert(!/^\[?leave/i.test(question.localizedText.en), `${question.id} exposes a conversation-exit choice as a useful question.`);
    }
  }
}

const markerAppearances = [];
const mappedCharacters = new Set();
const maps = new Set();
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  const locationsPath = path.join(projectRoot, "public", "maps", directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = readJson(contentPath);
  const locations = readJson(locationsPath).locations ?? [];
  const locationsByContentId = new Map(locations.map((location) => [location.contentId, location]));
  const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
  for (const entity of entities) {
    if (!entity.speakWithDead) continue;
    const characterId = entity.id.toLocaleLowerCase("en-US");
    const location = locationsByContentId.get(entity.id);
    const source = catalog.byCharacterId[characterId];
    assert(source, `${entity.id} has a public profile without an exact source character relation.`);
    assert(location?.categoryFacets?.includes("speak-with-dead"), `${directory.name}:${entity.id} is missing its Speak with Dead facet.`);
    assert.equal(entity.speakWithDead.questionCount, entity.speakWithDead.questions.length, `${entity.id} has an incorrect public question count.`);
    assert.equal("evidence" in entity.speakWithDead, false, `${entity.id} exposes raw source evidence in the user profile.`);
    assert(entity.speakWithDead.questions.every((question) => question.localizedText?.en), `${entity.id} exposes an unlocalized question.`);
    markerAppearances.push(entity);
    mappedCharacters.add(characterId);
    maps.add(directory.name);
  }
}

assert(markerAppearances.length >= 80, `Expected at least 80 mapped corpse-dialog appearances; received ${markerAppearances.length}.`);
assert(mappedCharacters.size >= 75, `Expected at least 75 unique mapped corpse-dialog characters; received ${mappedCharacters.size}.`);
assert(maps.size >= 20, `Expected corpse-dialog intelligence across at least 20 maps; received ${maps.size}.`);
console.log(`Speak with Dead: ${catalog.stats.matchedRelations}/${catalog.stats.relations} exact dialogue matches, ${catalog.stats.localizedQuestions} localized questions; ${markerAppearances.length} marker appearances for ${mappedCharacters.size} characters across ${maps.size} maps.`);
