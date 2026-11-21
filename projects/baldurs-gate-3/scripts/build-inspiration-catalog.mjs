import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument ${key ?? "<missing>"}.`);
    const name = key.slice(2);
    const current = result.get(name);
    result.set(name, current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value]);
  }
  return result;
};

const valuesFor = (arguments_, name) => {
  const value = arguments_.get(name);
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
};
const normalizedId = (value) => value?.toLocaleLowerCase("en-US");
const xmlAttribute = (body, id, field = "value") => body
  .match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\s${field}="([^"]*)"`))?.[1];
const cleanText = (value) => value
  .replaceAll("&lt;br&gt;", " ")
  .replace(/&lt;[^&]+?&gt;/g, "")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", "\"")
  .replace(/\s+/g, " ")
  .trim();

const readLocalization = (filePath) => {
  const xml = fs.readFileSync(filePath, "utf8");
  return new Map([...xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)]
    .map((match) => [match[1], cleanText(match[2])]));
};

const splitLsxNodes = (xml, nodeId) => {
  const lines = xml.split(/\r?\n/);
  const candidates = lines
    .map((line, index) => ({ index, indent: line.match(/^\s*/)?.[0].length ?? 0, value: line.trim() }))
    .filter((line) => line.value === `<node id="${nodeId}">`);
  if (candidates.length === 0) return [];
  const outerIndent = Math.min(...candidates.map((candidate) => candidate.indent));
  const starts = candidates.filter((candidate) => candidate.indent === outerIndent).map((candidate) => candidate.index);
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join("\n"));
};

const parseOriginBackgrounds = (filePaths) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const body of splitLsxNodes(xml, "Origin")) {
      const originId = normalizedId(xmlAttribute(body, "UUID"));
      const backgroundId = normalizedId(xmlAttribute(body, "BackgroundUUID"));
      if (originId && backgroundId) entries.set(originId, backgroundId);
    }
  }
  return entries;
};

const indexCharactersByBackground = (partyMemberCatalog, originBackgrounds) => {
  const entries = new Map();
  for (const member of partyMemberCatalog?.members ?? []) {
    const backgroundId = originBackgrounds.get(normalizedId(member.originId));
    if (!backgroundId) continue;
    const characters = entries.get(backgroundId) ?? [];
    characters.push({
      id: member.id,
      localizedNames: member.localizedNames,
    });
    entries.set(backgroundId, characters);
  }
  return entries;
};

const parseBackgrounds = (filePaths, localizations) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const match of xml.matchAll(/<node\s+id="Background">([\s\S]*?)<\/node>/g)) {
      const body = match[1];
      const id = xmlAttribute(body, "UUID")?.toLocaleLowerCase("en-US");
      if (!id) continue;
      const displayNameHandle = xmlAttribute(body, "DisplayName", "handle");
      const descriptionHandle = xmlAttribute(body, "Description", "handle");
      entries.set(id, {
        id,
        passives: xmlAttribute(body, "Passives"),
        localizedNames: Object.fromEntries(Object.entries(localizations)
          .map(([language, localization]) => [language, localization.get(displayNameHandle)])
          .filter(([, value]) => value)),
        localizedDescriptions: Object.fromEntries(Object.entries(localizations)
          .map(([language, localization]) => [language, localization.get(descriptionHandle)])
          .filter(([, value]) => value)),
      });
    }
  }
  return entries;
};

const parseGoalDefinitions = (filePaths, localizations, backgrounds) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const match of xml.matchAll(/<node\s+id="BackgroundGoal">([\s\S]*?)<\/node>/g)) {
      const body = match[1];
      const id = xmlAttribute(body, "UUID")?.toLocaleLowerCase("en-US");
      if (!id) continue;
      const backgroundId = xmlAttribute(body, "BackgroundUUID")?.toLocaleLowerCase("en-US");
      const titleHandle = xmlAttribute(body, "Title", "handle");
      const descriptionHandle = xmlAttribute(body, "Description", "handle");
      entries.set(id, {
        id,
        backgroundId,
        background: backgrounds.get(backgroundId),
        inspirationPoints: Number(xmlAttribute(body, "InspirationPoints")) || 0,
        rewardLevel: Number(xmlAttribute(body, "RewardLevel")) || 0,
        experienceRewardId: xmlAttribute(body, "ExperienceReward"),
        localizedTitles: Object.fromEntries(Object.entries(localizations)
          .map(([language, localization]) => [language, localization.get(titleHandle)])
          .filter(([, value]) => value)),
        localizedDescriptions: Object.fromEntries(Object.entries(localizations)
          .map(([language, localization]) => [language, localization.get(descriptionHandle)])
          .filter(([, value]) => value)),
        provenance: [{ sourcePath: path.relative(process.cwd(), filePath).split(path.sep).join("/") }],
      });
    }
  }
  return entries;
};

const findCompletionRuleAnchors = (lines, lineIndex, placementRecordsById) => {
  if (!lines[lineIndex].includes("PROC_GLO_Backgrounds_CompleteGoal")) return [];
  let startIndex = lineIndex;
  while (startIndex > 0 && !/^(?:IF|PROC|EVENT)$/.test(lines[startIndex].trim())) startIndex -= 1;
  if (!/^(?:IF|PROC|EVENT)$/.test(lines[startIndex].trim())) return [];
  const thenIndex = lines.findIndex((line, index) => index >= startIndex && index < lineIndex && line.trim() === "THEN");
  if (thenIndex < 0) return [];

  const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  for (let index = startIndex + 1; index < thenIndex; index += 1) {
    const statement = lines[index].trim();
    if (!statement || statement === "AND" || statement.startsWith("//")) continue;
    const anchors = [...new Set([...statement.matchAll(guidPattern)]
      .map((match) => normalizedId(match[0]))
      .filter((id) => placementRecordsById.has(id)))]
      .map((objectId) => {
        const record = placementRecordsById.get(objectId);
        return {
          objectId,
          level: record.level,
          placementKind: record.placementKind,
          internalName: record.internalName,
          localizedNames: record.displayName,
          triggerStatement: statement,
        };
      });
    // The first condition that resolves to a placed world object is the
    // trigger subject. Later range/region guards are context, not a second
    // location for the same event.
    if (anchors.length > 0) return anchors;
  }
  return [];
};

const parseStoryBindings = (filePaths, goals, placementRecordsById) => {
  const internalNames = new Map();
  const evidenceByInternalName = new Map();
  const registrationPattern = /DB_GLO_Backgrounds_Goal\([^\n]*?"([^"]+)"\s*,\s*(?:\(GUIDSTRING\))?([0-9a-f-]{36})\s*\);/gi;
  const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  for (const filePath of filePaths) {
    const source = fs.readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    for (const match of source.matchAll(registrationPattern)) {
      internalNames.set(match[1], match[2].toLocaleLowerCase("en-US"));
    }
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      for (const internalName of internalNames.keys()) {
        if (!lines[lineIndex].includes(`"${internalName}"`) || lines[lineIndex].includes("DB_GLO_Backgrounds_Goal(")) continue;
        // A binding is exact only when the object UUID and background goal occur
        // in the same Osiris statement. Nearby statements frequently register
        // unrelated goals from the same background and must never bleed together.
        const objectIds = [...new Set([...lines[lineIndex].matchAll(guidPattern)]
          .map((match) => match[0].toLocaleLowerCase("en-US"))
          .filter((id) => id !== internalNames.get(internalName) && goals.has(internalNames.get(internalName))))];
        const evidence = evidenceByInternalName.get(internalName) ?? [];
        evidence.push({
          sourcePath: path.relative(process.cwd(), filePath).split(path.sep).join("/"),
          sourceLine: lineIndex + 1,
          statement: lines[lineIndex].trim(),
          objectIds,
          ...(() => {
            const ruleAnchors = findCompletionRuleAnchors(lines, lineIndex, placementRecordsById);
            return ruleAnchors.length > 0 ? { ruleAnchors } : {};
          })(),
        });
        evidenceByInternalName.set(internalName, evidence);
      }
    }
  }

  return { internalNames, evidenceByInternalName };
};

const parseQuestUpdates = (evidence) => [...new Map(evidence.flatMap(({ statement }) => {
  const match = statement.match(/DB_GLO_Backgrounds_ChainAfterQuestUpdate\(\s*"([^"]+)"\s*,\s*"([^"]+)"/i);
  return match ? [[`${match[1].toLocaleLowerCase("en-US")}:${match[2].toLocaleLowerCase("en-US")}`, {
    questId: match[1],
    stepId: match[2],
  }]] : [];
})).values()];

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const outputPath = path.resolve(arguments_.get("output"));
  const localizations = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: readLocalization(path.resolve(arguments_.get("localization-tr"))),
  };
  const placementCatalog = JSON.parse(fs.readFileSync(path.resolve(arguments_.get("placement-catalog")), "utf8"));
  const placementRecordsById = new Map((placementCatalog.records ?? [])
    // Global characters can move between acts and maps; their authored spawn
    // is not proof of where a later inspiration condition completes. Portable
    // items remain useful when the rule itself names that exact item.
    .filter(({ id, position, globalPlacement, flags, partyHoldingSpot, placementKind }) => id
      && position
      && (placementKind === "items" || (!globalPlacement && !flags?.isGlobal))
      && !partyHoldingSpot)
    .map((record) => [normalizedId(record.id), record]));
  const partyMemberCatalog = JSON.parse(fs.readFileSync(path.resolve(arguments_.get("party-member-catalog")), "utf8"));
  const originBackgrounds = parseOriginBackgrounds(
    valuesFor(arguments_, "origin-source").map((filePath) => path.resolve(filePath)),
  );
  const charactersByBackground = indexCharactersByBackground(partyMemberCatalog, originBackgrounds);
  const backgrounds = parseBackgrounds(
    valuesFor(arguments_, "background-source").map((filePath) => path.resolve(filePath)),
    localizations,
  );
  const goals = parseGoalDefinitions(
    valuesFor(arguments_, "goal-source").map((filePath) => path.resolve(filePath)),
    localizations,
    backgrounds,
  );
  const { internalNames, evidenceByInternalName } = parseStoryBindings(
    valuesFor(arguments_, "story-source").map((filePath) => path.resolve(filePath)),
    goals,
    placementRecordsById,
  );
  const events = {};
  const byObjectId = {};
  const byQuestId = {};
  const byRuleObjectId = {};

  for (const [internalName, goalId] of internalNames) {
    const goal = goals.get(goalId);
    if (!goal) continue;
    const evidence = evidenceByInternalName.get(internalName) ?? [];
    const objectIds = [...new Set(evidence.flatMap((entry) => entry.objectIds))];
    const questUpdates = parseQuestUpdates(evidence);
    const ruleAnchors = [...new Map(evidence.flatMap((entry) => (entry.ruleAnchors ?? []).map((anchor) => [
      anchor.objectId,
      {
        ...anchor,
        sourcePath: entry.sourcePath,
        sourceLine: entry.sourceLine,
      },
    ]))).values()];
    const placementAnchors = ruleAnchors.length === 1 ? ruleAnchors : [];
    events[goalId] = {
      ...goal,
      ...(charactersByBackground.get(goal.backgroundId)?.length > 0
        ? { characters: charactersByBackground.get(goal.backgroundId) }
        : {}),
      internalName,
      act: internalName.match(/^Act(\d)/)?.[1],
      evidence,
      objectIds,
      ...(questUpdates.length > 0 ? { questUpdates } : {}),
      ...(ruleAnchors.length > 0 ? { ruleAnchors } : {}),
      ...(placementAnchors.length > 0 ? { placementAnchors } : {}),
    };
    for (const objectId of objectIds) {
      byObjectId[objectId] = [...new Set([...(byObjectId[objectId] ?? []), goalId])];
    }
    for (const { questId } of questUpdates) {
      const key = questId.toLocaleLowerCase("en-US");
      byQuestId[key] = [...new Set([...(byQuestId[key] ?? []), goalId])];
    }
    for (const { objectId } of placementAnchors) {
      byRuleObjectId[objectId] = [...new Set([...(byRuleObjectId[objectId] ?? []), goalId])];
    }
  }

  const catalog = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    sourceBuild: arguments_.get("source-build"),
    stats: {
      backgrounds: backgrounds.size,
      goalDefinitions: goals.size,
      registeredEvents: Object.keys(events).length,
      eventsWithObjectEvidence: Object.values(events).filter(({ objectIds }) => objectIds.length > 0).length,
      eventsWithQuestEvidence: Object.values(events).filter(({ questUpdates }) => questUpdates?.length > 0).length,
      eventsWithRuleAnchorCandidates: Object.values(events).filter(({ ruleAnchors }) => ruleAnchors?.length > 0).length,
      highConfidenceRuleAnchoredEvents: Object.values(events).filter(({ placementAnchors }) => placementAnchors?.length === 1).length,
      linkedObjectIds: Object.keys(byObjectId).length,
      linkedQuestIds: Object.keys(byQuestId).length,
      linkedRuleObjectIds: Object.keys(byRuleObjectId).length,
    },
    backgrounds: Object.fromEntries(backgrounds),
    events,
    byObjectId,
    byQuestId,
    byRuleObjectId,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Inspiration catalog: ${catalog.stats.registeredEvents} events, ${catalog.stats.linkedObjectIds} direct object links, ${catalog.stats.highConfidenceRuleAnchoredEvents} high-confidence rule anchors.`);
};

main();
