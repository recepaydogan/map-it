import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "quest-journal.json"));

assert.equal(catalog.schemaVersion, 4, "Expected the journal catalog schema with exact conditional branch rules.");
assert(catalog.stats.quests >= 160, `Expected at least 160 quests; received ${catalog.stats.quests}.`);
assert(catalog.stats.visibleQuests >= 150, `Expected at least 150 visible quests; received ${catalog.stats.visibleQuests}.`);
assert(catalog.stats.steps >= 3_500, `Expected at least 3,500 journal steps; received ${catalog.stats.steps}.`);
assert(catalog.stats.localizedSteps >= 3_500, `Expected at least 3,500 localized journal steps; received ${catalog.stats.localizedSteps}.`);
assert(catalog.stats.objectives >= 1_300, `Expected at least 1,300 quest objectives; received ${catalog.stats.objectives}.`);
assert(catalog.stats.markers >= 500, `Expected at least 500 journal marker resources; received ${catalog.stats.markers}.`);
assert(catalog.stats.linkedObjectives >= 700, `Expected at least 700 linked objectives; received ${catalog.stats.linkedObjectives}.`);
assert(catalog.stats.targetObjects >= 300, `Expected at least 300 exact target objects; received ${catalog.stats.targetObjects}.`);
assert(catalog.stats.experienceRewards >= 27, `Expected at least 27 merged experience rewards; received ${catalog.stats.experienceRewards}.`);
assert(catalog.stats.areaLevelOverrides >= 99, `Expected at least 99 area-level overrides; received ${catalog.stats.areaLevelOverrides}.`);
assert.equal(catalog.stats.rewardBearingSteps, 812, "Expected every authored quest-step reward UUID to resolve.");
assert.equal(catalog.stats.areaLevelSteps, 903, "Expected every authored quest-step area UUID to resolve.");
assert.equal(catalog.stats.conditionalRules, 205, "Expected every static conditional quest-state rule to be extracted.");
assert.equal(catalog.stats.conditionalSteps, 160, "Expected every conditional rule to resolve to its exact journal step.");

const unlockDisableValues = new Set();
for (const quest of Object.values(catalog.quests)) {
  assert(quest.id && Array.isArray(quest.steps), "Every quest must retain its identity and steps.");
  for (const step of quest.steps) {
    assert(step.id && step.guid, `${quest.id} contains an unidentified journal step.`);
    assert(Number.isInteger(step.unlockDisable), `${step.guid} has a non-integer UnlockDisable value.`);
    assert(step.unlockDisable >= 0 && step.unlockDisable <= 3, `${step.guid} has unsupported UnlockDisable value ${step.unlockDisable}.`);
    assert(Number.isInteger(step.levelOverride) && step.levelOverride >= 0, `${step.guid} has an invalid LevelOverride.`);
    assert(Number.isInteger(step.questRewardLevel) && step.questRewardLevel >= 0, `${step.guid} has an invalid QuestRewardLevel.`);
    if (step.experienceRewardId) {
      assert(step.experienceReward, `${step.guid} has unresolved experience reward ${step.experienceRewardId}.`);
      assert.equal(step.experienceReward.id, step.experienceRewardId, `${step.guid} resolved a different experience reward.`);
      assert(catalog.experienceRewards[step.experienceRewardId], `${step.guid} references an experience reward outside the catalog.`);
    }
    if (step.statTriggerId) {
      assert(step.areaLevel, `${step.guid} has unresolved area-level trigger ${step.statTriggerId}.`);
      assert.equal(step.areaLevel.id, step.statTriggerId, `${step.guid} resolved a different area-level trigger.`);
      assert(catalog.areaLevelOverrides[step.statTriggerId], `${step.guid} references an area level outside the catalog.`);
    }
    for (const rule of step.conditionalRules ?? []) {
      assert(rule.id && rule.trigger?.id && rule.condition?.id, `${quest.id}/${step.id} has an unresolved conditional rule.`);
      assert.equal(typeof rule.expected, "boolean", `${quest.id}/${step.id} has a non-boolean conditional expectation.`);
      assert(rule.trigger.title && rule.condition.title, `${quest.id}/${step.id} exposes an unreadable conditional rule.`);
      assert(rule.provenance.includes("story-goals"), `${quest.id}/${step.id} lost its story provenance.`);
      assert.equal(rule.evidence.statement.split("(", 1)[0], "DB_QuestDef_State_ConditionalFlag", `${quest.id}/${step.id} has invalid conditional-rule evidence.`);
    }
    unlockDisableValues.add(step.unlockDisable);
    if (step.localizedDescriptions?.en) {
      assert(!step.localizedDescriptions.en.startsWith("h"), `${step.guid} exposes a localization handle instead of text.`);
    }
  }
}
assert(unlockDisableValues.has(2) && unlockDisableValues.has(3), "Expected the source's non-boolean UnlockDisable variants to survive extraction.");

const glutQuest = catalog.quests.UND_BroodingSovereign;
const acceptedImmediately = glutQuest.steps.find((step) => step.id === "AcceptedJoin");
const acceptedAfterRefusal = glutQuest.steps.find((step) => step.id === "RefusedThenAccepted");
assert.equal(acceptedImmediately.conditionalRules[0].condition.internalName, "UND_MyconidCircle_State_DeclinedBroodingSovereign", "Expected Glut's recruitment branch to retain its exact condition.");
assert.equal(acceptedImmediately.conditionalRules[0].expected, false, "Expected the immediate recruitment branch to require the refusal flag to be absent.");
assert.equal(acceptedAfterRefusal.conditionalRules[0].expected, true, "Expected the changed-mind branch to require the refusal flag to be present.");

let linkCount = 0;
const linkedObjectives = new Set();
for (const [targetObjectId, links] of Object.entries(catalog.byTarget)) {
  assert(targetObjectId && links.length > 0, "Every target index entry must contain at least one relation.");
  for (const link of links) {
    const quest = catalog.quests[link.questId];
    const objective = catalog.objectives[link.objectiveId];
    const marker = catalog.markers[link.markerGuid];
    assert(quest, `${targetObjectId} references missing quest ${link.questId}.`);
    assert(objective, `${targetObjectId} references missing objective ${link.objectiveId}.`);
    assert(marker, `${targetObjectId} references missing marker ${link.markerGuid}.`);
    assert.equal(objective.questId, quest.id, `${objective.id} belongs to a different quest.`);
    assert(objective.markerIds.includes(marker.id), `${objective.id} does not reference marker ${marker.id}.`);
    assert.equal(marker.targetObjectId, targetObjectId, `${marker.guid} points at a different target object.`);
    assert(marker.level, `${marker.guid} has no source level.`);
    linkedObjectives.add(objective.id);
    linkCount += 1;
  }
}
assert.equal(linkCount, catalog.stats.links, "The target index link count does not match catalog statistics.");
assert.equal(linkedObjectives.size, catalog.stats.linkedObjectives, "The linked objective count does not match catalog statistics.");

const questEntities = [];
const questMaps = new Set();
let primaryQuestMarkers = 0;
let rewardStepAppearances = 0;
let areaLevelStepAppearances = 0;
let conditionalStepAppearances = 0;
for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  const locationsPath = path.join(projectRoot, "public", "maps", directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = readJson(contentPath);
  const locations = readJson(locationsPath).locations ?? [];
  const locationsByContent = new Map(locations.map((location) => [location.contentId, location]));
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.quest) continue;
    const targetObjectId = entity.id.toLocaleLowerCase("en-US");
    const location = locationsByContent.get(entity.id);
    questEntities.push(entity);
    questMaps.add(directory.name);
    if (entity.kind === "quest") primaryQuestMarkers += 1;
    assert(catalog.byTarget[targetObjectId], `${entity.id} has quest data without an exact target-object relation.`);
    assert(location, `${directory.name}:${entity.id} has no matching location.`);
    assert(location.categoryFacets?.includes("quest"), `${directory.name}:${entity.id} is missing its quest filter facet.`);
    assert.equal(entity.quest.questCount, entity.quest.quests.length, `${entity.id} quest count is incorrect.`);
    assert.equal(entity.quest.objectiveCount, entity.quest.quests.reduce((total, quest) => total + quest.objectives.length, 0), `${entity.id} objective count is incorrect.`);
    assert.equal(entity.quest.journalStepCount, entity.quest.quests.reduce(
      (total, quest) => total + quest.objectives.reduce((sum, objective) => sum + objective.steps.length, 0),
      0,
    ), `${entity.id} journal step count is incorrect.`);
    for (const quest of entity.quest.quests) {
      assert(catalog.quests[quest.id], `${entity.id} references missing quest ${quest.id}.`);
      for (const objective of quest.objectives) {
        assert(!objective.id.toLocaleLowerCase("en-US").includes("outdated"), `${entity.id} exposes outdated objective ${objective.id}.`);
        assert.equal(objective.markerLevel, entity.sourceLevel, `${entity.id} leaks a quest marker from ${objective.markerLevel} into ${entity.sourceLevel}.`);
        assert(catalog.objectives[objective.id], `${entity.id} references missing objective ${objective.id}.`);
        rewardStepAppearances += objective.steps.filter((step) => step.experienceReward?.name && step.experienceReward.name !== "Zero").length;
        areaLevelStepAppearances += objective.steps.filter((step) => step.areaLevel).length;
        conditionalStepAppearances += objective.steps.filter((step) => step.conditionalRules?.length).length;
      }
    }
  }
}

assert(questEntities.length >= 100, `Expected quest intelligence on at least 100 marker appearances; received ${questEntities.length}.`);
assert(questMaps.size >= 15, `Expected quest intelligence across at least 15 maps; received ${questMaps.size}.`);
assert(primaryQuestMarkers >= 50, `Expected at least 50 newly surfaced primary quest markers; received ${primaryQuestMarkers}.`);
assert(questEntities.some((entity) => entity.quest.questCount > 1), "Expected a target shared by multiple quests.");
assert(questEntities.some((entity) => entity.quest.journalStepCount > 1), "Expected a target with alternative journal states.");
assert(rewardStepAppearances >= 100, `Expected at least 100 mapped reward-tier step appearances; received ${rewardStepAppearances}.`);
assert(areaLevelStepAppearances >= 100, `Expected at least 100 mapped area-level step appearances; received ${areaLevelStepAppearances}.`);
assert(conditionalStepAppearances >= 25, `Expected at least 25 mapped conditional quest-step appearances; received ${conditionalStepAppearances}.`);

const objectiveAppearances = questEntities.reduce((total, entity) => total + entity.quest.objectiveCount, 0);
console.log(`Quest intelligence: ${catalog.stats.quests} quests / ${catalog.stats.objectives} objectives / ${catalog.stats.steps} journal steps / ${catalog.stats.conditionalRules} conditional rules; ${questEntities.length} marker appearances across ${questMaps.size} maps (${primaryQuestMarkers} primary quest markers, ${objectiveAppearances} objective appearances, ${rewardStepAppearances} reward-tier states, ${areaLevelStepAppearances} area-level states, ${conditionalStepAppearances} conditional branch appearances).`);
