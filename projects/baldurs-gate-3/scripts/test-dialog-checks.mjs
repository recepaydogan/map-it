import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "dialog-checks.json"));

assert.equal(catalog.schemaVersion, 4, "Expected graph-aware player-choice consequence extraction.");
assert(catalog.stats.files >= 9_000, `Expected at least 9,000 dialog files to be scanned; received ${catalog.stats.files}.`);
assert(catalog.stats.dialogs >= 1_000, `Expected at least 1,000 dialogs with checks or approval events; received ${catalog.stats.dialogs}.`);
assert(catalog.stats.checks >= 3_500, `Expected at least 3,500 extracted checks; received ${catalog.stats.checks}.`);
assert(catalog.stats.localizedChoices >= 3_100, `Expected at least 3,100 localized check choices; received ${catalog.stats.localizedChoices}.`);
assert(catalog.stats.approvalFiles >= 2_100, `Expected at least 2,100 approval reaction resources; received ${catalog.stats.approvalFiles}.`);
assert(catalog.stats.approvalRatings >= 2_000, `Expected at least 2,000 used approval ratings; received ${catalog.stats.approvalRatings}.`);
assert(catalog.stats.approvalEvents >= 3_700, `Expected at least 3,700 extracted approval events; received ${catalog.stats.approvalEvents}.`);
assert(catalog.stats.localizedApprovalEvents >= 3_300, `Expected at least 3,300 localized approval events; received ${catalog.stats.localizedApprovalEvents}.`);
assert(catalog.stats.characterChoices >= 2_600, `Expected at least 2,600 character-gated dialogue choices; received ${catalog.stats.characterChoices}.`);
assert(catalog.stats.localizedCharacterChoices >= 2_300, `Expected at least 2,300 localized character-gated choices; received ${catalog.stats.localizedCharacterChoices}.`);
assert(catalog.stats.choiceOutcomes >= 4_500, `Expected at least 4,500 consequential player choices; received ${catalog.stats.choiceOutcomes}.`);
assert.equal(catalog.stats.localizedChoiceOutcomes, catalog.stats.choiceOutcomes, "Expected every consequential player choice to retain localized text.");
assert(catalog.stats.consequenceFlags >= 7_000, `Expected at least 7,000 meaningful story flags to be resolvable; received ${catalog.stats.consequenceFlags}.`);
assert(catalog.stats.rewardRelations >= 140, `Expected at least 140 exact item-reward event relations; received ${catalog.stats.rewardRelations}.`);
assert.equal(catalog.stats.classOptionTags, 12, "Expected every authoritative base class tag to appear in dialogue conditions.");
assert(catalog.stats.raceOptionTags >= 17, `Expected at least 17 playable race tags in dialogue conditions; received ${catalog.stats.raceOptionTags}.`);
assert(catalog.stats.approvalOrigins >= 13, `Expected at least 13 authoritative approval origins; received ${catalog.stats.approvalOrigins}.`);
assert(catalog.stats.filterableApprovalOrigins >= 12, `Expected at least 12 named Origin or companion approval profiles; received ${catalog.stats.filterableApprovalOrigins}.`);
assert.equal(catalog.stats.unresolvedApprovalEffects, 0, "Expected every extracted approval origin UUID to resolve authoritatively.");

const numericDifficultyChecks = Object.values(catalog.dialogs)
  .reduce((total, dialog) => total + dialog.checks.filter((check) => check.difficultyClass !== undefined).length, 0);
assert(numericDifficultyChecks >= 3_450, `Expected at least 3,450 checks with resolved numeric DCs; received ${numericDifficultyChecks}.`);

for (const dialog of Object.values(catalog.dialogs)) {
  assert(dialog.participants.length > 0, `${dialog.id} has no participant UUIDs.`);
  assert(dialog.checks.length > 0 || dialog.approvals.length > 0 || dialog.characterChoices.length > 0 || dialog.choiceOutcomes.length > 0, `${dialog.id} has no dialogue intelligence.`);
  assert(dialog.module, `${dialog.id} has no source module identity.`);
  assert(dialog.provenance.endsWith(".lsj"), `${dialog.id} has invalid provenance ${dialog.provenance}.`);
  for (const check of dialog.checks) {
    assert(check.id && check.rollType, `${dialog.id} contains an unidentified check.`);
    if (check.difficultyClass !== undefined) {
      assert(Number.isInteger(check.difficultyClass) && check.difficultyClass > 0, `${check.id} has invalid difficulty class.`);
    }
    if (check.localizedText?.en) assert(!check.localizedText.en.startsWith("h"), `${check.id} exposes a localization handle instead of text.`);
  }
  for (const approval of dialog.approvals) {
    assert(approval.id && approval.approvalRatingId, `${dialog.id} contains an unidentified approval event.`);
    assert(approval.effects.length > 0, `${approval.id} has no resolved approval effects.`);
    assert(approval.reactionProvenance.endsWith(".lsx"), `${approval.id} has invalid reaction provenance.`);
    for (const effect of approval.effects) {
      assert(effect.originId && effect.originName, `${approval.id} contains an unresolved approval subject.`);
      assert(Number.isInteger(effect.value) && effect.value !== 0, `${approval.id} exposes a zero or non-integer approval delta.`);
      assert.equal(typeof effect.originFilterEligible, "boolean", `${approval.id} approval subject is missing its filter eligibility.`);
    }
    if (approval.localizedText?.en) assert(!approval.localizedText.en.startsWith("h"), `${approval.id} exposes a localization handle instead of text.`);
  }
  for (const choice of dialog.characterChoices) {
    assert(choice.id && choice.facets.length > 0, `${dialog.id} contains an unidentified character-gated choice.`);
    assert.equal(choice.conditionSource, "node.checkflags", `${choice.id} does not retain its exact condition source.`);
    for (const facet of choice.facets) {
      assert(facet.id && facet.internalName && facet.definitionId, `${choice.id} contains an unresolved character option tag.`);
      assert(facet.kind === "class" || facet.kind === "race", `${choice.id} contains an invalid character option kind.`);
      assert(facet.localizedNames?.en, `${choice.id}/${facet.internalName} has no localized facet name.`);
    }
    if (choice.localizedText?.en) assert(!choice.localizedText.en.startsWith("h"), `${choice.id} exposes a localization handle instead of text.`);
  }
  for (const choice of dialog.choiceOutcomes) {
    assert(choice.id && choice.consequences.length > 0, `${dialog.id} contains an unidentified consequential choice.`);
    assert.equal(choice.nodeType, "TagQuestion", `${choice.id} is not an authored player-choice node.`);
    assert.equal(choice.consequenceScope, "choice-path-before-next-question", `${choice.id} has an unsupported consequence scope.`);
    assert(choice.localizedText?.en, `${choice.id} has no localized player-choice text.`);
    assert(!choice.localizedText.en.startsWith("h"), `${choice.id} exposes a localization handle instead of text.`);
    for (const consequence of choice.consequences) {
      assert(consequence.id && consequence.internalName && consequence.title, `${choice.id} contains an unresolved consequence flag.`);
      for (const reward of consequence.rewards ?? []) {
        assert(reward.itemId && reward.itemInternalName && reward.title, `${choice.id}/${consequence.id} contains an unresolved item reward.`);
        assert(Number.isInteger(reward.amount) && reward.amount > 0, `${reward.id} has an invalid reward amount.`);
        assert(reward.evidence?.statement.startsWith("DB_Give"), `${reward.id} lost its exact story evidence.`);
      }
    }
  }
}

const laezelRecruitmentDialog = catalog.dialogs["0e39193f-1b9c-38f8-10e2-0b5922cb098e"];
const hostileTieflingChoice = laezelRecruitmentDialog?.choiceOutcomes.find((choice) =>
  choice.consequences.some((consequence) => consequence.internalName === "CHA_LaezelRecruitment_Event_TieflingsHostile"));
assert.equal(hostileTieflingChoice?.localizedText?.en, "Attack the tiefling.", "Expected Lae'zel's recruitment choice to retain its exact text.");
assert.equal(hostileTieflingChoice?.consequences[0]?.title, "Tieflings Hostile", "Expected Lae'zel's recruitment choice to resolve its exact hostility outcome.");

const hatcheryCaretaker = Object.values(catalog.dialogs)
  .find((dialog) => dialog.provenance.endsWith("CRE_Hatchery_Caretaker.lsj"));
const bootsRewardChoices = hatcheryCaretaker?.choiceOutcomes.filter((choice) =>
  choice.consequences.some((consequence) => consequence.id === "e1faea76-a2fd-a691-9755-4ce2cc7131bd")) ?? [];
assert.equal(bootsRewardChoices.length, 3, "Expected every immediate dialogue branch that grants the hatchery boots.");
assert(bootsRewardChoices.some((choice) => choice.localizedText.en === "I'll raise it as if it were my own flesh and blood."),
  "Expected the hatchery reward to resolve through its answer and alias nodes to the exact player choice.");
assert.equal(bootsRewardChoices[0].consequences[0].rewards[0].title, "Hatchery Boots", "Expected the hatchery choice to expose its exact item reward.");

const enrichedMarkers = [];
const enrichedMaps = new Set();
const approvalMarkers = [];
const approvalMaps = new Set();
const characterChoiceMarkers = [];
const characterChoiceMaps = new Set();
const choiceOutcomeMarkers = [];
const choiceOutcomeMaps = new Set();
let mappedRewardAppearances = 0;
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = readJson(contentPath);
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.dialogue) continue;
    enrichedMarkers.push(entity);
    enrichedMaps.add(directory.name);
    assert(catalog.byParticipant[entity.id.toLocaleLowerCase("en-US")], `${entity.id} has dialogue data without a direct participant match.`);
    assert.equal(entity.dialogue.checkCount, entity.dialogue.choices.length, `${entity.id} dialogue count does not match its choices.`);
    assert.equal(entity.dialogue.localizedChoiceCount, entity.dialogue.choices.filter((choice) => choice.localizedText?.en).length, `${entity.id} localized choice count is incorrect.`);
    assert.equal(entity.dialogue.approvalEventCount, entity.dialogue.approvalEvents.length, `${entity.id} approval event count is incorrect.`);
    assert.equal(entity.dialogue.approvalEffectCount, entity.dialogue.approvalEvents.reduce((total, event) => total + event.effects.length, 0), `${entity.id} approval effect count is incorrect.`);
    if (entity.dialogue.approvalEventCount > 0) {
      approvalMarkers.push(entity);
      approvalMaps.add(directory.name);
    }
    assert.equal(entity.dialogue.characterChoiceCount, entity.dialogue.characterChoices.length, `${entity.id} character choice count is incorrect.`);
    assert.equal(entity.dialogue.localizedCharacterChoiceCount, entity.dialogue.characterChoices.filter((choice) => choice.localizedText?.en).length, `${entity.id} localized character choice count is incorrect.`);
    if (entity.dialogue.characterChoiceCount > 0) {
      characterChoiceMarkers.push(entity);
      characterChoiceMaps.add(directory.name);
      assert(entity.dialogue.characterFacets.length > 0, `${entity.id} has character choices without filter facets.`);
      for (const choice of entity.dialogue.characterChoices) {
        assert.equal(choice.conditionSource, "node.checkflags", `${entity.id}/${choice.id} lost its exact condition provenance.`);
      }
    }
    assert.equal(entity.dialogue.choiceOutcomeCount, entity.dialogue.choiceOutcomes.length, `${entity.id} choice outcome count is incorrect.`);
    if (entity.dialogue.choiceOutcomeCount > 0) {
      choiceOutcomeMarkers.push(entity);
      choiceOutcomeMaps.add(directory.name);
      for (const choice of entity.dialogue.choiceOutcomes) {
        assert(choice.localizedText?.en, `${entity.id}/${choice.id} lost its exact localized player choice.`);
        assert(choice.consequences.length > 0, `${entity.id}/${choice.id} lost its consequence relationships.`);
        for (const consequence of choice.consequences) {
          for (const reward of consequence.rewards ?? []) {
            assert(reward.itemId && reward.title, `${entity.id}/${choice.id} exposes an unresolved item reward.`);
            assert.equal("evidence" in reward, false, `${entity.id}/${choice.id} exposes raw reward evidence in the user profile.`);
            mappedRewardAppearances += 1;
          }
        }
      }
    }
  }
}

assert(enrichedMarkers.length >= 340, `Expected dialog checks on at least 340 map markers; received ${enrichedMarkers.length}.`);
assert(enrichedMaps.size >= 20, `Expected dialog checks across at least 20 maps; received ${enrichedMaps.size}.`);
assert(enrichedMarkers.some((entity) => entity.dialogue.skills.includes("Persuasion")), "Expected a marker with Persuasion checks.");
assert(enrichedMarkers.some((entity) => entity.dialogue.choices.some((choice) => choice.rollType === "SavingThrow")), "Expected a marker with saving throws.");
assert(approvalMarkers.length >= 340, `Expected approval intelligence on at least 340 map markers; received ${approvalMarkers.length}.`);
assert(approvalMaps.size >= 18, `Expected approval intelligence across at least 18 maps; received ${approvalMaps.size}.`);
assert(approvalMarkers.some((entity) => entity.dialogue.approvalEvents.some((event) => event.effects.length > 1)), "Expected a choice that affects multiple approval targets.");
assert(approvalMarkers.some((entity) => entity.dialogue.approvalEvents.some((event) => event.effects.some((effect) => effect.value > 0))), "Expected a positive approval effect.");
assert(approvalMarkers.some((entity) => entity.dialogue.approvalEvents.some((event) => event.effects.some((effect) => effect.value < 0))), "Expected a negative approval effect.");
assert(approvalMarkers.some((entity) => entity.dialogue.approvalEvents.some((event) => event.effects.some((effect) => effect.originFilterEligible))), "Expected a marker linked to a named Origin or companion profile.");
assert(approvalMarkers.some((entity) => entity.dialogue.approvalEvents.some((event) => event.effects.some((effect) => !effect.originFilterEligible))), "Expected generic reaction buckets to remain distinguishable from filterable profiles.");
assert(characterChoiceMarkers.length >= 250, `Expected character-gated dialogue on at least 250 map markers; received ${characterChoiceMarkers.length}.`);
assert(characterChoiceMaps.size >= 18, `Expected character-gated dialogue across at least 18 maps; received ${characterChoiceMaps.size}.`);
assert(characterChoiceMarkers.some((entity) => entity.dialogue.characterFacets.some((facet) => facet.kind === "class")), "Expected a marker with class-gated dialogue.");
assert(characterChoiceMarkers.some((entity) => entity.dialogue.characterFacets.some((facet) => facet.kind === "race")), "Expected a marker with race-gated dialogue.");
assert(choiceOutcomeMarkers.length >= 100, `Expected consequential choices on at least 100 map markers; received ${choiceOutcomeMarkers.length}.`);
assert(choiceOutcomeMaps.size >= 15, `Expected consequential choices across at least 15 maps; received ${choiceOutcomeMaps.size}.`);
assert(mappedRewardAppearances >= 50, `Expected at least 50 exact item-reward appearances on mapped dialogue choices; received ${mappedRewardAppearances}.`);
assert(choiceOutcomeMarkers.some((entity) => entity.dialogue.choiceOutcomes.some((choice) =>
  choice.consequences.some((consequence) => consequence.internalName === "FactionHostileToPlayerGroupAfterDialog"))),
"Expected a mapped choice that starts combat by making a faction hostile.");

const totalMarkerChecks = enrichedMarkers.reduce((total, entity) => total + entity.dialogue.checkCount, 0);
const totalMarkerApprovalEvents = approvalMarkers.reduce((total, entity) => total + entity.dialogue.approvalEventCount, 0);
const totalMarkerChoiceOutcomes = choiceOutcomeMarkers.reduce((total, entity) => total + entity.dialogue.choiceOutcomeCount, 0);
console.log(`Dialogue intelligence: ${catalog.stats.dialogs} dialogs / ${catalog.stats.checks} checks / ${catalog.stats.approvalEvents} approval events / ${catalog.stats.choiceOutcomes} consequential choices / ${catalog.stats.rewardRelations} reward relations; ${enrichedMarkers.length} markers across ${enrichedMaps.size} maps (${totalMarkerChecks} unique checks, ${totalMarkerApprovalEvents} approval triggers, ${totalMarkerChoiceOutcomes} exact choice outcomes, ${mappedRewardAppearances} reward appearances).`);
