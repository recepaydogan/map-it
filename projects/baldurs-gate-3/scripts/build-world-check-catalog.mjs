import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  const sources = [];
  const difficultySources = [];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (key === "--source") sources.push(value);
    else if (key === "--difficulty-classes") difficultySources.push(value);
    else result.set(key.slice(2), value);
  }
  if (sources.length === 0) throw new Error("At least one --source directory is required.");
  if (difficultySources.length === 0) throw new Error("At least one --difficulty-classes file is required.");
  for (const required of ["output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  result.set("sources", sources);
  result.set("difficultySources", difficultySources);
  return result;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const attribute = (body, id) => body.match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\svalue="([^"]*)"`))?.[1];
const normalizeId = (value) => value?.toLocaleLowerCase("en-US");
const GUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const NULL_ID = "00000000-0000-0000-0000-000000000000";
const ambushRosterAliases = {
  db_sha_orthonlair_party: {
    ambushTriggerObjectId: "56b326c2-bbf7-4693-b0e0-63c7f7f23011",
    memberIndex: 0,
    excludedObjectIds: new Set(["0d5e3e88-972b-4577-b6b2-b0946f38fce2"]),
  },
  db_end_morphicpool_intdevambusher: {
    ambushTriggerObjectId: "b0565acb-a246-4bdc-9544-111bc84f3007",
    memberIndex: 0,
  },
  db_end_morphicpool_intdevambusher_secondwave: {
    ambushTriggerObjectId: "b0565acb-a246-4bdc-9544-111bc84f3007",
    memberIndex: 0,
  },
  db_for_villageambushers: {
    ambushTriggerObjectId: "e2f45a27-9ead-4bea-8ecb-f8dcd38fec97",
    memberIndex: 0,
  },
  db_sha_trials_mirrorcharacters: {
    ambushTriggerObjectId: "76fe7265-7cc8-4022-b990-397f86713cb7",
    memberIndex: 0,
  },
  db_scl_drider_harpersgroup: {
    ambushTriggerObjectId: "74df3b45-284f-42f7-b0c4-b40359c1de55",
    memberIndex: 0,
  },
  db_twn_aasimarsurvivor_ochrejelly: {
    ambushTriggerObjectId: "d600c6b0-0279-487b-b065-37fae3763347",
    memberIndex: 0,
  },
};
const rosterAliasPattern = Object.keys(ambushRosterAliases)
  .map((predicate) => predicate.slice(3))
  .join("|");

const readDifficultyClasses = (filePaths) => {
  const entries = {};
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const match of xml.matchAll(/<node\s+id="DifficultyClass">([\s\S]*?)<\/node>/g)) {
      const body = match[1];
      const id = normalizeId(attribute(body, "UUID"));
      if (!id) continue;
      entries[id] = {
        id,
        name: attribute(body, "Name"),
        value: Number(attribute(body, "Difficulties")),
      };
    }
  }
  if (Object.keys(entries).length === 0) throw new Error("No difficulty classes were parsed from the supplied files.");
  return entries;
};

const maskComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, "");

const splitArguments = (source) => {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
};

const readStaticCalls = (source) => {
  const calls = [];
  const pattern = new RegExp(`\\b(DB_(?:KnowledgeCheckTrigger_AD|KnowledgeCheckItem_AD|PerceptionSkillCustomAD|AmbushTrigger_Ambusher_Appear|AmbushTrigger_Ambusher|SCL_Misc_PlantBlights_Ambushing|AmbushTrigger|${rosterAliasPattern})|PROC_TrySkillCheck|RequestActiveRoll|RequestPassiveRoll)\\s*\\(`, "gi");
  for (const match of source.matchAll(pattern)) {
    const before = source.slice(Math.max(0, match.index - 8), match.index);
    if (/NOT\s*$/.test(before)) continue;
    const argumentStart = match.index + match[0].length;
    let depth = 1;
    let quote = null;
    let argumentEnd = -1;
    for (let index = argumentStart; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote && source[index - 1] !== "\\") quote = null;
        continue;
      }
      if (character === "\"" || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          argumentEnd = index;
          break;
        }
      }
    }
    if (argumentEnd < 0) continue;
    let terminator = argumentEnd + 1;
    while (/\s/.test(source[terminator] ?? "")) terminator += 1;
    if (source[terminator] !== ";") continue;
    calls.push({
      type: match[1].replace(/^DB_/i, ""),
      arguments: source.slice(argumentStart, argumentEnd),
      sourceLine: source.slice(0, match.index).split("\n").length,
    });
  }
  return calls;
};

const unquote = (value) => value?.trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
const extractGuid = (value) => normalizeId(value?.match(GUID_PATTERN)?.[0]);
const meaningfulGuid = (value) => value && value !== NULL_ID ? value : undefined;
const stripEntitySuffix = (value) => value?.replace(new RegExp(`_${GUID_PATTERN.source}$`, "i"), "") ?? "";
const humanizeIdentifier = (value) => stripEntitySuffix(value)
  .replace(/^\([A-Z]+\)/, "")
  .replace(/^(?:TRIGGERGUID_|DIALOGRESOURCEGUID_|FLAGGUID_|S_)/, "")
  .replace(/^[A-Z0-9]{2,4}_/, "")
  .replace(/_/g, " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\bAD\b/g, "")
  .replace(/\bPAD\b/g, "")
  .replace(/\b(?:Perception|Detection|Detect)?\s*(?:Box|Area|Trigger)\b/gi, "")
  .replace(/\s+/g, " ")
  .trim();

const sourceIdentity = (sourceRoot, filePath) => ({
  module: path.basename(sourceRoot),
  provenance: `${path.basename(sourceRoot)}/${path.relative(sourceRoot, filePath).split(path.sep).join("/")}`,
});

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoots = arguments_.get("sources").map((source) => path.resolve(source));
  const difficulties = readDifficultyClasses(arguments_.get("difficultySources").map((source) => path.resolve(source)));
  const records = [];
  const ambusherRegistrations = [];
  const seen = new Set();
  let fileCount = 0;
  let rawCallCount = 0;
  let unresolvedDifficultyCount = 0;

  for (const sourceRoot of sourceRoots) {
    const files = walkFiles(sourceRoot)
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".txt"))
      .filter((filePath) => !path.basename(filePath).includes("SavegamePatches"))
      .sort((left, right) => left.localeCompare(right, "en"));
    fileCount += files.length;
    for (const filePath of files) {
      const source = maskComments(fs.readFileSync(filePath, "utf8"));
      const identity = sourceIdentity(sourceRoot, filePath);
      for (const match of readStaticCalls(source)) {
        rawCallCount += 1;
        const argumentsList = splitArguments(match.arguments);
        const callType = match.type.toLocaleLowerCase("en-US");
        const alias = ambushRosterAliases[`db_${callType}`];
        if (alias) {
          const memberArgument = argumentsList[alias.memberIndex];
          const ambusherObjectId = meaningfulGuid(extractGuid(memberArgument));
          if (!ambusherObjectId || alias.excludedObjectIds?.has(ambusherObjectId)) continue;
          ambusherRegistrations.push({
            ambushTriggerObjectId: alias.ambushTriggerObjectId,
            ambusherObjectId,
            token: stripEntitySuffix(memberArgument)
              .replace(/^\([A-Z]+\)/, "")
              .trim(),
            sourceLine: match.sourceLine,
            ...identity,
          });
          continue;
        }
        if ([
          "ambushtrigger_ambusher",
          "ambushtrigger_ambusher_appear",
          "scl_misc_plantblights_ambushing",
        ].includes(callType)) {
          if (argumentsList.length < 2) continue;
          const reversed = callType === "scl_misc_plantblights_ambushing";
          const triggerArgument = argumentsList[reversed ? 1 : 0];
          const ambusherArgument = argumentsList[reversed ? 0 : 1];
          const ambushTriggerObjectId = meaningfulGuid(extractGuid(triggerArgument));
          const ambusherObjectId = meaningfulGuid(extractGuid(ambusherArgument));
          if (!ambushTriggerObjectId || !ambusherObjectId) continue;
          ambusherRegistrations.push({
            ambushTriggerObjectId,
            ambusherObjectId,
            token: stripEntitySuffix(ambusherArgument)
              .replace(/^\([A-Z]+\)/, "")
              .trim(),
            sourceLine: match.sourceLine,
            ...identity,
          });
          continue;
        }
        if (["knowledgechecktrigger_ad", "knowledgecheckitem_ad"].includes(callType)) {
          if (argumentsList.length < 6) continue;
          const targetObjectId = meaningfulGuid(extractGuid(argumentsList[1]));
          const difficultyClassId = meaningfulGuid(extractGuid(argumentsList[3]));
          if (!targetObjectId || !difficultyClassId) continue;
          const difficulty = difficulties[difficultyClassId];
          if (!difficulty) unresolvedDifficultyCount += 1;
          const checkId = unquote(argumentsList[0]);
          const skill = unquote(argumentsList[2]);
          const record = {
            id: `knowledge:${targetObjectId}:${skill}:${difficultyClassId}`,
            type: "knowledge-check",
            category: /puzzle/i.test(`${checkId} ${path.basename(filePath)}`) ? "puzzle" : "secret",
            targetObjectId,
            title: humanizeIdentifier(checkId) || `${skill} Check`,
            checkId,
            skill,
            difficultyClassId,
            difficultyClassName: difficulty?.name,
            difficultyClass: difficulty?.value,
            dialogId: meaningfulGuid(extractGuid(argumentsList[4])),
            successFlagId: meaningfulGuid(extractGuid(argumentsList[5])),
            sourceLine: match.sourceLine,
            ...identity,
          };
          const key = `${record.type}:${targetObjectId}:${skill}:${difficultyClassId}`;
          if (!seen.has(key)) {
            seen.add(key);
            records.push(record);
          }
          continue;
        }

        if (callType === "perceptionskillcustomad") {
          if (argumentsList.length < 2) continue;
          const targetObjectId = meaningfulGuid(extractGuid(argumentsList[0]));
          if (!targetObjectId) continue;
          const record = {
            id: `skill:${targetObjectId}:Perception:custom`,
            type: "skill-check",
            category: "secret",
            targetObjectId,
            title: humanizeIdentifier(argumentsList[0]) || "Perception Check",
            skill: "Perception",
            dialogId: meaningfulGuid(extractGuid(argumentsList[1])),
            sourceLine: match.sourceLine,
            ...identity,
          };
          const key = `${record.type}:${targetObjectId}:Perception:custom`;
          if (!seen.has(key)) {
            seen.add(key);
            records.push(record);
          }
          continue;
        }

        if (["proc_tryskillcheck", "requestactiveroll", "requestpassiveroll"].includes(callType)) {
          if (argumentsList.length < 5) continue;
          const targetObjectId = meaningfulGuid(extractGuid(argumentsList[1]));
          const difficultyIndex = argumentsList.findIndex((argument, index) => (
            index >= 2 && difficulties[extractGuid(argument)]
          ));
          if (!targetObjectId || difficultyIndex < 0) continue;
          const difficultyClassId = extractGuid(argumentsList[difficultyIndex]);
          const difficulty = difficulties[difficultyClassId];
          const rollTokens = argumentsList.slice(2, difficultyIndex)
            .map(unquote)
            .filter((value) => value && !/^(?:SkillCheck|SavingThrow|RawAbility)$/i.test(value));
          const skill = rollTokens.at(-1);
          if (!skill) continue;
          const eventToken = [...argumentsList.slice(difficultyIndex + 1)]
            .reverse()
            .map(unquote)
            .find((value) => value && !/^\d+$/.test(value));
          const rollType = callType === "requestpassiveroll" && /SavingThrow/i.test(unquote(argumentsList[2]))
            ? "saving-throw"
            : "skill-check";
          const record = {
            id: `${rollType}:${targetObjectId}:${skill}:${difficultyClassId}:${eventToken || match.sourceLine}`,
            type: rollType,
            category: /puzzle/i.test(`${eventToken} ${path.basename(filePath)}`) ? "puzzle" : "secret",
            targetObjectId,
            title: humanizeIdentifier(eventToken || argumentsList[1]) || `${skill} Check`,
            skill,
            difficultyClassId,
            difficultyClassName: difficulty.name,
            difficultyClass: difficulty.value,
            sourceLine: match.sourceLine,
            ...identity,
          };
          const key = `${record.type}:${targetObjectId}:${skill}:${difficultyClassId}:${eventToken || ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            records.push(record);
          }
          continue;
        }

        if (argumentsList.length < 3) continue;
        const ambushTriggerObjectId = meaningfulGuid(extractGuid(argumentsList[0]));
        const detectionTriggerObjectId = meaningfulGuid(extractGuid(argumentsList[1]));
        const targetObjectId = detectionTriggerObjectId ?? ambushTriggerObjectId;
        if (!targetObjectId || !ambushTriggerObjectId) continue;
        const difficultyClassId = meaningfulGuid(extractGuid(argumentsList[2]));
        const difficulty = difficultyClassId ? difficulties[difficultyClassId] : undefined;
        if (difficultyClassId && !difficulty) unresolvedDifficultyCount += 1;
        const rawTitle = stripEntitySuffix(argumentsList[0]);
        const record = {
          id: `ambush:${targetObjectId}:${difficultyClassId ?? "none"}`,
          type: "ambush",
          category: "encounter",
          targetObjectId,
          title: humanizeIdentifier(rawTitle).replace(/\b(?:Initiate|Start)\b/gi, "").trim() || "Ambush",
          skill: detectionTriggerObjectId ? "Perception" : undefined,
          difficultyClassId,
          difficultyClassName: difficulty?.name,
          difficultyClass: difficulty?.value,
          ambushTriggerObjectId,
          detectionTriggerObjectId,
          sourceLine: match.sourceLine,
          ...identity,
        };
        const key = `${record.type}:${targetObjectId}:${difficultyClassId ?? "none"}`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push(record);
        }
      }
    }
  }

  const uniqueAmbusherRegistrations = [...new Map(ambusherRegistrations.map((registration) => [
    `${registration.ambushTriggerObjectId}:${registration.ambusherObjectId}`,
    registration,
  ])).values()];
  const ambushersByTrigger = Map.groupBy(
    uniqueAmbusherRegistrations,
    ({ ambushTriggerObjectId }) => ambushTriggerObjectId,
  );
  for (const record of records.filter(({ type }) => type === "ambush")) {
    record.ambushers = ambushersByTrigger.get(record.ambushTriggerObjectId) ?? [];
    record.ambusherCount = record.ambushers.length;
  }

  records.sort((left, right) => left.targetObjectId.localeCompare(right.targetObjectId, "en")
    || left.type.localeCompare(right.type, "en")
    || left.id.localeCompare(right.id, "en"));
  const byTarget = {};
  for (const record of records) (byTarget[record.targetObjectId] ??= []).push(record);
  const knowledgeChecks = records.filter((record) => record.type === "knowledge-check").length;
  const skillChecks = records.filter((record) => record.type === "skill-check").length;
  const savingThrows = records.filter((record) => record.type === "saving-throw").length;
  const ambushes = records.filter((record) => record.type === "ambush").length;
  const outputPath = path.resolve(arguments_.get("output"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    stats: {
      files: fileCount,
      rawCalls: rawCallCount,
      records: records.length,
      knowledgeChecks,
      skillChecks,
      savingThrows,
      ambushes,
      targetObjects: Object.keys(byTarget).length,
      resolvedDifficulties: records.filter((record) => record.difficultyClass !== undefined).length,
      unresolvedDifficulties: unresolvedDifficultyCount,
      ambusherRegistrations: uniqueAmbusherRegistrations.length,
      ambushesWithRoster: records.filter((record) => record.type === "ambush" && record.ambusherCount > 0).length,
    },
    records,
    byTarget,
  }, null, 2)}\n`);
  console.log(`World checks: ${knowledgeChecks} knowledge checks, ${skillChecks} skill checks, ${savingThrows} saving throws and ${ambushes} ambushes (${uniqueAmbusherRegistrations.length} exact ambushers) across ${Object.keys(byTarget).length} exact target objects.`);
};

try {
  main();
} catch (error) {
  console.error("World-check catalog build failed:", error);
  process.exitCode = 1;
}
