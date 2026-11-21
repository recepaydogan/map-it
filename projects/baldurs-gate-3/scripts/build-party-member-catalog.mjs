import fs from "node:fs";
import path from "node:path";

// Builds the recruitable party-member catalog: every origin listed in the
// recipe is joined to its exact race, class and subclass definitions, its
// journal quests and every map position the story places it at. Positions are
// either the character's authored placement or a story trigger the recipe
// cites; each story position must match an exact statement in the extracted
// Osiris goals, so the catalog never claims a location the scripts do not.

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    result.set(key.slice(2), value);
  }
  for (const required of ["recipe", "placements", "quest-catalog", "story-root", "localization-en", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return result;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const normalizedId = (value) => value?.toLocaleLowerCase("en-US");
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

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
  for (const match of xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)) {
    entries.set(match[1], stripLocalizationMarkup(match[2]));
  }
  return entries;
};

/** Larian LSX files keep sibling resource nodes at one indentation, so a
 * line-oriented split avoids a runtime XML dependency. */
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

const readAttribute = (body, id) => body.match(new RegExp(`<attribute\\s+id="${id}"[^>]*(?:value|handle)="([^"]+)"`))?.[1];

const readDefinitions = (sources, nodeId) => {
  const definitions = new Map();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const body of splitLsxNodes(xml, nodeId)) {
      const id = normalizedId(readAttribute(body, "UUID"));
      if (!id) continue;
      definitions.set(id, {
        id,
        internalName: readAttribute(body, "Name"),
        displayNameHandle: readAttribute(body, "DisplayName"),
        provenance: path.basename(source),
      });
    }
  }
  return definitions;
};

/** Later origin sources refine earlier ones: a release-build origin fills in
 * the subrace and display handle an early-access origin left out. */
const readOrigins = (sources, projectRoot) => {
  const origins = new Map();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const body of splitLsxNodes(xml, "Origin")) {
      const id = normalizedId(readAttribute(body, "UUID"));
      if (!id) continue;
      const current = origins.get(id) ?? { id, provenance: [] };
      const pick = (attribute, previous) => {
        const value = readAttribute(body, attribute);
        return value && normalizedId(value) !== EMPTY_GUID ? value : previous;
      };
      origins.set(id, {
        id,
        internalName: pick("Name", current.internalName),
        displayNameHandle: pick("DisplayName", current.displayNameHandle),
        descriptionHandle: pick("Description", current.descriptionHandle),
        globalTemplateId: normalizedId(pick("GlobalTemplate", current.globalTemplateId)),
        raceId: normalizedId(pick("RaceUUID", current.raceId)),
        subRaceId: normalizedId(pick("SubRaceUUID", current.subRaceId)),
        classId: normalizedId(pick("ClassUUID", current.classId)),
        subClassId: normalizedId(pick("SubClassUUID", current.subClassId)),
        provenance: [...current.provenance, path.relative(projectRoot, source).split(path.sep).join("/")],
      });
    }
  }
  return origins;
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const recipePath = path.resolve(arguments_.get("recipe"));
  const recipe = readJson(recipePath);
  if (recipe.schemaVersion !== 1 || !Array.isArray(recipe.members)) throw new Error("Unsupported party-member recipe schema.");
  const placements = readJson(path.resolve(arguments_.get("placements")));
  const questCatalog = readJson(path.resolve(arguments_.get("quest-catalog")));
  const storyRoot = path.resolve(arguments_.get("story-root"));
  const outputPath = path.resolve(arguments_.get("output"));
  const sourceBuild = arguments_.get("source-build") ?? null;
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr") ? readLocalization(path.resolve(arguments_.get("localization-tr"))) : new Map(),
  };
  const localize = (handle) => Object.fromEntries(Object.entries({
    en: handle ? localization.en.get(handle) : undefined,
    tr: handle ? localization.tr.get(handle) : undefined,
  }).filter(([, value]) => value));

  const resolveSources = (relativePaths) => relativePaths.map((relativePath) => path.resolve(projectRoot, relativePath));
  const origins = readOrigins(resolveSources(recipe.originSources), projectRoot);
  const classes = readDefinitions(resolveSources(recipe.classSources), "ClassDescription");
  const races = readDefinitions(resolveSources(recipe.raceSources), "Race");
  const placementsById = new Map(placements.records.map((record) => [normalizedId(record.id), record]));
  const storyLines = new Map();
  const readStoryLines = (relativePath) => {
    if (!storyLines.has(relativePath)) {
      storyLines.set(relativePath, fs.readFileSync(path.join(storyRoot, relativePath), "utf8").split(/\r?\n/));
    }
    return storyLines.get(relativePath);
  };

  const describe = (definition) => definition ? {
    id: definition.id,
    internalName: definition.internalName,
    localizedNames: localize(definition.displayNameHandle),
  } : null;
  const requireDefinition = (definitions, id, label, memberId) => {
    if (!id) return null;
    const definition = definitions.get(id);
    if (!definition) throw new Error(`${memberId}: ${label} ${id} is not in the extracted definitions.`);
    const described = describe(definition);
    if (!described.localizedNames.en) throw new Error(`${memberId}: ${label} ${definition.internalName} has no English name.`);
    return described;
  };

  const members = [];
  const byCharacterId = {};
  const byAnchorId = {};
  for (const memberRecipe of recipe.members) {
    const origin = origins.get(normalizedId(memberRecipe.originId));
    if (!origin) throw new Error(`${memberRecipe.id}: origin ${memberRecipe.originId} is not in the extracted origins.`);
    const characterId = normalizedId(memberRecipe.characterId);
    if (origin.globalTemplateId !== characterId) {
      throw new Error(`${memberRecipe.id}: character ${characterId} does not match the origin's global template ${origin.globalTemplateId}.`);
    }
    const character = placementsById.get(characterId);
    if (!character || character.placementKind !== "characters") throw new Error(`${memberRecipe.id}: character ${characterId} has no placement record.`);
    const localizedNames = localize(origin.displayNameHandle);
    if (!localizedNames.en) throw new Error(`${memberRecipe.id}: origin has no English display name.`);

    const quests = memberRecipe.questIds.map((questId) => {
      const quest = questCatalog.quests?.[questId];
      if (!quest) throw new Error(`${memberRecipe.id}: quest ${questId} is not in the journal catalog.`);
      return { id: quest.id, guid: quest.guid, localizedTitles: quest.localizedTitles };
    });

    const positions = memberRecipe.positions.map((positionRecipe) => {
      if (positionRecipe.kind === "authored") {
        if (memberRecipe.authoredPosition === false) throw new Error(`${memberRecipe.id}: authored position is disabled but listed.`);
        return {
          id: positionRecipe.id,
          kind: "authored",
          contentId: character.id,
          level: character.level,
          position: character.position,
          localizedConditions: positionRecipe.conditions,
          evidence: character.provenance.map(({ sourcePath }) => ({ sourcePath })),
        };
      }
      const anchorId = normalizedId(positionRecipe.anchorId);
      const anchor = placementsById.get(anchorId);
      if (!anchor?.position) throw new Error(`${memberRecipe.id}: anchor ${anchorId} has no positioned placement record.`);
      const evidence = (positionRecipe.evidence ?? []).map(({ storySource, statement }) => {
        const lines = readStoryLines(storySource);
        const matches = lines.flatMap((line, index) => line.includes(statement) ? [index + 1] : []);
        if (matches.length === 0) throw new Error(`${memberRecipe.id}: ${storySource} has no statement ${statement}.`);
        return { sourcePath: `map-sources/extracted/story-goals/${storySource}`, sourceLine: matches[0], statement: lines[matches[0] - 1].trim() };
      });
      if (evidence.length === 0) throw new Error(`${memberRecipe.id}: story position ${positionRecipe.id} needs story evidence.`);
      const contentId = `${character.id}:party-position:${anchor.id}`;
      byAnchorId[anchorId] = { memberId: memberRecipe.id, positionId: positionRecipe.id, contentId };
      return {
        id: positionRecipe.id,
        kind: "story",
        contentId,
        anchorContentId: anchor.id,
        anchorName: anchor.internalName,
        level: anchor.level,
        position: anchor.position,
        localizedConditions: positionRecipe.conditions,
        evidence,
      };
    });

    const member = {
      id: memberRecipe.id,
      originId: origin.id,
      originInternalName: origin.internalName,
      characterId: character.id,
      characterInternalName: character.internalName,
      localizedNames,
      localizedDescriptions: localize(origin.descriptionHandle),
      race: requireDefinition(races, origin.raceId, "race", memberRecipe.id),
      subRace: requireDefinition(races, origin.subRaceId, "subrace", memberRecipe.id),
      class: requireDefinition(classes, origin.classId, "class", memberRecipe.id),
      subClass: requireDefinition(classes, origin.subClassId, "subclass", memberRecipe.id),
      quests,
      authoredPosition: memberRecipe.authoredPosition !== false,
      // A member who is first met as a boss (Minthara) keeps that marker and
      // answers the party-member filter through a facet instead.
      keepBossMarker: memberRecipe.keepBossMarker === true,
      positions,
      provenance: origin.provenance,
    };
    members.push(member);
    byCharacterId[characterId] = member.id;
  }

  const stats = {
    members: members.length,
    positions: members.reduce((total, member) => total + member.positions.length, 0),
    storyPositions: members.reduce((total, member) => total + member.positions.filter(({ kind }) => kind === "story").length, 0),
    quests: new Set(members.flatMap((member) => member.quests.map(({ id }) => id))).size,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceBuild,
    recipe: path.relative(projectRoot, recipePath).split(path.sep).join("/"),
    stats,
    members,
    byCharacterId,
    byAnchorId,
  }, null, 2)}\n`);
  console.log(`Party-member catalog: ${stats.members} members, ${stats.positions} positions (${stats.storyPositions} story-scripted), ${stats.quests} quests.`);
};

try {
  main();
} catch (error) {
  console.error("Party-member catalog build failed:", error);
  process.exitCode = 1;
}
