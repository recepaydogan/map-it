import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  const experienceRewardSources = [];
  const areaLevelSources = [];
  const storySources = [];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (key === "--experience-rewards") experienceRewardSources.push(value);
    else if (key === "--area-level-overrides") areaLevelSources.push(value);
    else if (key === "--story-source") storySources.push(value);
    else result.set(key.slice(2), value);
  }
  for (const required of ["quest-source", "objective-source", "marker-source", "localization-en", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  if (experienceRewardSources.length === 0) throw new Error("At least one --experience-rewards file is required.");
  if (areaLevelSources.length === 0) throw new Error("At least one --area-level-overrides file is required.");
  result.set("experienceRewardSources", experienceRewardSources);
  result.set("areaLevelSources", areaLevelSources);
  result.set("storySources", storySources);
  return result;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

const readLocalization = (filePath) => {
  const xml = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  const pattern = /<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g;
  for (const match of xml.matchAll(pattern)) entries.set(match[1], stripLocalizationMarkup(match[2]));
  return entries;
};

const attribute = (body, id) => body.match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\svalue="([^"]*)"`))?.[1];
const handle = (body, id) => body.match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\shandle="([^"]*)"`))?.[1];
const normalizeId = (value) => value?.toLocaleLowerCase("en-US");
const isMeaningfulId = (value) => value && value !== "00000000-0000-0000-0000-000000000000";
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '"' && body[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};

const storyEndpoint = (argument) => {
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const match = token.match(new RegExp(`^([A-Za-z0-9_]+)_(${guidPattern.source})$`, "i"));
  if (!match || !isMeaningfulId(match[2].toLocaleLowerCase("en-US"))) return null;
  return { id: match[2].toLocaleLowerCase("en-US"), internalName: match[1] };
};
const quotedArgument = (argument) => argument.match(/^"([^"]+)"$/)?.[1];
const humanizeStoryFlag = (internalName) => {
  if (/PartOfTheTeam_/.test(internalName)) {
    const character = internalName.split("PartOfTheTeam_")[1];
    return `${character} is in the party`;
  }
  const semantic = internalName.match(/_(?:State|Event|Quest|Knows|HasMet)_([^]+)$/)?.[1]
    ?? internalName.replace(/^(?:[A-Z0-9]{2,6}_)+/, "");
  return semantic
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/Perma Defeated/gi, "permanently defeated")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toLocaleUpperCase("en-US"));
};

const readConditionalQuestRules = (sourcePaths, projectRoot) => {
  const byQuestAndStep = new Map();
  for (const sourcePath of sourcePaths) {
    const files = (fs.statSync(sourcePath).isDirectory() ? walkFiles(sourcePath) : [sourcePath])
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".txt"))
      .sort((left, right) => left.localeCompare(right, "en"));
    for (const filePath of files) {
      const fileText = fs.readFileSync(filePath, "utf8");
      const initSection = fileText.match(/\bINITSECTION\b([\s\S]*?)\bKBSECTION\b/)?.[1];
      if (!initSection) continue;
      const lines = initSection.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const sourceLine = fileText.slice(0, fileText.indexOf("INITSECTION") + "INITSECTION".length).split(/\r?\n/).length + index;
        const firstLine = lines[index].trim();
        if (!firstLine.startsWith("DB_QuestDef_State_ConditionalFlag(")) continue;
        let statement = firstLine;
        let balance = [...firstLine].reduce((total, character) => total + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        while (balance > 0 && index + 1 < lines.length) {
          index += 1;
          const nextLine = lines[index].trim();
          statement += ` ${nextLine}`;
          balance += [...nextLine].reduce((total, character) => total + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        }
        statement = statement.slice(0, statement.lastIndexOf(")") + 1).replace(/\s+/g, " ");
        const values = splitArguments(statement);
        const trigger = storyEndpoint(values[0] ?? "");
        const questId = quotedArgument(values[1] ?? "");
        const stepId = quotedArgument(values[2] ?? "");
        const expected = Number(values[3]);
        const condition = storyEndpoint(values[4] ?? "");
        if (!trigger || !questId || !stepId || !condition || ![0, 1].includes(expected)) continue;
        const key = `${questId}:${stepId}`;
        const rules = byQuestAndStep.get(key) ?? [];
        const id = `${trigger.id}:${condition.id}:${expected}`;
        if (!rules.some((rule) => rule.id === id)) rules.push({
          id,
          trigger: { ...trigger, title: humanizeStoryFlag(trigger.internalName) },
          condition: { ...condition, title: humanizeStoryFlag(condition.internalName) },
          expected: expected === 1,
          provenance: `${path.relative(projectRoot, filePath).split(path.sep).join("/")}:${sourceLine}`,
          evidence: {
            sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
            sourceLine,
            statement,
          },
        });
        byQuestAndStep.set(key, rules);
      }
    }
  }
  return byQuestAndStep;
};

const readLevelMapEntries = (filePaths, nodeId, readEntry) => {
  const entries = {};
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    const source = path.basename(path.dirname(filePath));
    for (const match of xml.matchAll(new RegExp(`<node\\s+id="${nodeId}">([\\s\\S]*?)<\\/node>`, "g"))) {
      const body = match[1];
      const id = normalizeId(attribute(body, "UUID"));
      if (!id) continue;
      entries[id] = {
        id,
        ...readEntry(body),
        module: source,
        provenance: `${source}/${path.basename(filePath)}`,
      };
    }
  }
  return entries;
};

const readExperienceRewards = (filePaths) => readLevelMapEntries(filePaths, "ExperienceReward", (body) => ({
  name: attribute(body, "Name"),
  rewardType: Number(attribute(body, "RewardType") ?? 0),
  levelSource: Number(attribute(body, "LevelSource") ?? 0),
}));

const readAreaLevelOverrides = (filePaths) => readLevelMapEntries(filePaths, "AreaLevelOverride", (body) => ({
  name: attribute(body, "Name"),
  entityLevel: Number(attribute(body, "EntityLevel") ?? 0),
  treasureLevel: Number(attribute(body, "TreasureLevel") ?? 0),
  parentId: normalizeId(attribute(body, "ParentUUID")),
}));

const localize = (localization, textHandle) => Object.fromEntries(Object.entries({
  en: textHandle ? localization.en.get(textHandle) : undefined,
  tr: textHandle ? localization.tr.get(textHandle) : undefined,
}).filter(([, value]) => value));

const readQuests = (filePath, localization, experienceRewards, areaLevelOverrides, conditionalRules) => {
  const xml = fs.readFileSync(filePath, "utf8");
  const quests = {};
  let stepCount = 0;
  let localizedStepCount = 0;
  for (const chunk of xml.split(/<node\s+id="Quest">/).slice(1)) {
    const header = chunk.split("<children>", 1)[0];
    const id = attribute(header, "QuestID");
    if (!id) continue;
    const titleHandle = handle(header, "QuestTitle");
    const steps = chunk.split(/<node\s+id="QuestStep">/).slice(1).map((stepChunk) => {
      const body = stepChunk.split("</node>", 1)[0];
      const descriptionHandle = handle(body, "Description");
      const localizedDescriptions = localize(localization, descriptionHandle);
      if (localizedDescriptions.en) localizedStepCount += 1;
      stepCount += 1;
      const dialogFlagId = normalizeId(attribute(body, "DialogFlagGUID"));
      const statTriggerId = normalizeId(attribute(body, "StatTriggerGUID"));
      const experienceRewardId = normalizeId(attribute(body, "ExperienceReward"));
      const rewardTreasureTable = attribute(body, "RewardAdditionalTreasureTable");
      const stepId = attribute(body, "ID");
      return {
        id: stepId,
        guid: normalizeId(attribute(body, "QuestStepGuid")),
        objectiveId: attribute(body, "Objective"),
        descriptionHandle,
        localizedDescriptions,
        ...(isMeaningfulId(dialogFlagId) ? { dialogFlagId } : {}),
        ...(isMeaningfulId(statTriggerId) ? { statTriggerId } : {}),
        ...(isMeaningfulId(experienceRewardId) ? {
          experienceRewardId,
          experienceReward: experienceRewards[experienceRewardId],
        } : {}),
        ...(isMeaningfulId(statTriggerId) && areaLevelOverrides[statTriggerId] ? {
          areaLevel: areaLevelOverrides[statTriggerId],
        } : {}),
        ...(rewardTreasureTable ? { rewardTreasureTable } : {}),
        levelOverride: Number(attribute(body, "LevelOverride") ?? 0),
        questRewardLevel: Number(attribute(body, "QuestRewardLevel") ?? 0),
        unlockDisable: Number(attribute(body, "UnlockDisable") ?? 0),
        conditionalRules: conditionalRules.get(`${id}:${stepId}`) ?? [],
      };
    }).filter((step) => step.id && step.guid);
    quests[id] = {
      id,
      guid: normalizeId(attribute(header, "QuestGuid")),
      categoryId: attribute(header, "CategoryID"),
      parentQuestId: attribute(header, "ParentQuestID") || undefined,
      titleHandle,
      localizedTitles: localize(localization, titleHandle),
      visible: attribute(header, "QuestVisiblity") !== "false",
      sortingPriority: Number(attribute(header, "SortingPriority") ?? 0),
      steps,
    };
  }
  return { quests, stepCount, localizedStepCount };
};

const readObjectives = (filePath, localization) => {
  const xml = fs.readFileSync(filePath, "utf8");
  const objectives = {};
  let localizedObjectiveCount = 0;
  for (const chunk of xml.split(/<node\s+id="Objective">/).slice(1)) {
    const header = chunk.split("<children>", 1)[0];
    const id = attribute(header, "ObjectiveID");
    if (!id) continue;
    const descriptionHandle = handle(header, "Description");
    const localizedDescriptions = localize(localization, descriptionHandle);
    if (localizedDescriptions.en) localizedObjectiveCount += 1;
    const markerIds = [...chunk.matchAll(/<attribute\s+id="Markers"[^>]*\svalue="([^"]+)"/g)]
      .map((match) => match[1]);
    objectives[id] = {
      id,
      guid: normalizeId(attribute(header, "QuestObjectiveGuid")),
      questId: attribute(header, "QuestID"),
      descriptionHandle,
      localizedDescriptions,
      priority: Number(attribute(header, "Priority") ?? 0),
      markerIds: [...new Set(markerIds)],
    };
  }
  return { objectives, localizedObjectiveCount };
};

const readMarkers = (directory, localization) => {
  const markers = {};
  const byMarkerId = {};
  const files = walkFiles(directory)
    .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsx"))
    .sort((left, right) => left.localeCompare(right, "en"));
  for (const filePath of files) {
    const xml = fs.readFileSync(filePath, "utf8");
    const guid = normalizeId(attribute(xml, "Guid"));
    const id = attribute(xml, "MarkerID");
    if (!guid || !id) continue;
    const displayTextHandle = handle(xml, "DisplayText");
    const marker = {
      guid,
      id,
      level: attribute(xml, "MarkerLevel"),
      targetType: attribute(xml, "MarkerTargetObjectType"),
      targetObjectId: normalizeId(attribute(xml, "MarkerTargetObjectUUID")),
      icon: attribute(xml, "MarkerIcon"),
      displayTextHandle,
      localizedDisplayTexts: localize(localization, displayTextHandle),
      provenance: path.relative(directory, filePath).split(path.sep).join("/"),
    };
    markers[guid] = marker;
    (byMarkerId[id] ??= []).push(guid);
  }
  return { markers, byMarkerId, fileCount: files.length };
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr")
      ? readLocalization(path.resolve(arguments_.get("localization-tr")))
      : new Map(),
  };
  const experienceRewards = readExperienceRewards(arguments_.get("experienceRewardSources").map((source) => path.resolve(source)));
  const areaLevelOverrides = readAreaLevelOverrides(arguments_.get("areaLevelSources").map((source) => path.resolve(source)));
  const conditionalRules = readConditionalQuestRules(
    arguments_.get("storySources").map((source) => path.resolve(source)),
    projectRoot,
  );
  const questCatalog = readQuests(
    path.resolve(arguments_.get("quest-source")),
    localization,
    experienceRewards,
    areaLevelOverrides,
    conditionalRules,
  );
  const objectiveCatalog = readObjectives(path.resolve(arguments_.get("objective-source")), localization);
  const markerCatalog = readMarkers(path.resolve(arguments_.get("marker-source")), localization);
  const byTarget = {};
  let linkedObjectiveCount = 0;
  let linkCount = 0;

  for (const objective of Object.values(objectiveCatalog.objectives)) {
    const quest = questCatalog.quests[objective.questId];
    if (!quest || objective.markerIds.length === 0) continue;
    let linked = false;
    for (const markerId of objective.markerIds) {
      for (const markerGuid of markerCatalog.byMarkerId[markerId] ?? []) {
        const marker = markerCatalog.markers[markerGuid];
        if (!marker?.targetObjectId) continue;
        (byTarget[marker.targetObjectId] ??= []).push({
          questId: quest.id,
          objectiveId: objective.id,
          markerGuid,
        });
        linked = true;
        linkCount += 1;
      }
    }
    if (linked) linkedObjectiveCount += 1;
  }

  for (const links of Object.values(byTarget)) {
    links.sort((left, right) => left.questId.localeCompare(right.questId, "en")
      || left.objectiveId.localeCompare(right.objectiveId, "en")
      || left.markerGuid.localeCompare(right.markerGuid, "en"));
  }

  const outputPath = path.resolve(arguments_.get("output"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 4,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    stats: {
      quests: Object.keys(questCatalog.quests).length,
      visibleQuests: Object.values(questCatalog.quests).filter((quest) => quest.visible).length,
      steps: questCatalog.stepCount,
      localizedSteps: questCatalog.localizedStepCount,
      objectives: Object.keys(objectiveCatalog.objectives).length,
      localizedObjectives: objectiveCatalog.localizedObjectiveCount,
      markerFiles: markerCatalog.fileCount,
      markers: Object.keys(markerCatalog.markers).length,
      linkedObjectives: linkedObjectiveCount,
      targetObjects: Object.keys(byTarget).length,
      links: linkCount,
      experienceRewards: Object.keys(experienceRewards).length,
      areaLevelOverrides: Object.keys(areaLevelOverrides).length,
      rewardBearingSteps: Object.values(questCatalog.quests).reduce(
        (total, quest) => total + quest.steps.filter((step) => step.experienceReward).length,
        0,
      ),
      areaLevelSteps: Object.values(questCatalog.quests).reduce(
        (total, quest) => total + quest.steps.filter((step) => step.areaLevel).length,
        0,
      ),
      conditionalRules: [...conditionalRules.values()].reduce((total, rules) => total + rules.length, 0),
      conditionalSteps: Object.values(questCatalog.quests).reduce(
        (total, quest) => total + quest.steps.filter((step) => step.conditionalRules.length > 0).length,
        0,
      ),
    },
    experienceRewards,
    areaLevelOverrides,
    quests: questCatalog.quests,
    objectives: objectiveCatalog.objectives,
    markers: markerCatalog.markers,
    byTarget,
  }, null, 2)}\n`);
  console.log(`Quest journal: ${Object.keys(questCatalog.quests).length} quests, ${questCatalog.stepCount} steps, ${linkedObjectiveCount} linked objectives across ${Object.keys(byTarget).length} target objects.`);
};

try {
  main();
} catch (error) {
  console.error("Quest journal catalog build failed:", error);
  process.exitCode = 1;
}
