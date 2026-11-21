import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "readable-impacts.json");
const emptyGuid = "00000000-0000-0000-0000-000000000000";
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const directDefinitions = {
  DB_BookFlags: { scope: "object", objectIndex: 0, flagIndex: 1, impactKind: "knowledge" },
  DB_BookTemplateFlags: { scope: "template", objectIndex: 0, flagIndex: 1, impactKind: "knowledge" },
  DB_LOW_SetFlagOnReadDocument: { scope: "object", objectIndex: 0, flagIndex: 1, impactKind: "map-reveal" },
  DB_LOW_SetFlagOnReadDocumentRoot: { scope: "template", objectIndex: 0, flagIndex: 1, impactKind: "map-reveal" },
  // This exact two-column database is forwarded to DB_BookFlags in Act1_UND_ArcaneTower.
  DB_UND_ArcaneTower_Poems: { scope: "object", objectIndex: 0, flagIndex: 1, impactKind: "knowledge" },
};

const fixedFlagAliases = {
  // Every concrete member is forwarded to both DB_BookFlags calls in Act3_GEN_SerialKiller.
  DB_SerialKiller_NoteFromOrinBooks: [
    "LOW_MurderTribunal_Knows_WordOfPassage_839150e6-d168-4c89-a980-68b9e9f60556",
    "LOW_MurderTribunal_Knows_UnholyAssassin_8a939a44-bb4a-d32f-0584-388d248f565c",
  ],
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

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

const endpoint = (argument) => {
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const match = token.match(new RegExp(`^([A-Za-z0-9_]+)_(${guidPattern.source})$`, "i"));
  if (!match || match[2].toLocaleLowerCase("en-US") === emptyGuid) return null;
  return { id: match[2].toLocaleLowerCase("en-US"), token: `${match[1]}_${match[2]}` };
};

const stringArgument = (argument) => argument.trim().match(/^"([^"]+)"$/)?.[1] ?? null;

const statements = [];
for (const filePath of walkFiles(storyRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const startIndex = index;
    const firstLine = lines[index].trim().replace(/^NOT\s+/, "");
    const predicate = firstLine.match(/^(DB_[A-Za-z0-9_]+)\s*\(/)?.[1];
    if (!predicate) continue;
    let statement = firstLine;
    let balance = [...firstLine].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
    while (balance > 0 && index + 1 < lines.length) {
      index += 1;
      const nextLine = lines[index].trim();
      statement += ` ${nextLine}`;
      balance += [...nextLine].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
    }
    const closedStatement = statement.slice(0, statement.lastIndexOf(")") + 1).replace(/\s+/g, " ");
    statements.push({
      predicate,
      arguments: splitArguments(closedStatement),
      evidence: {
        sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
        sourceLine: startIndex + 1,
        statement: closedStatement,
      },
    });
  }
}

const objectEntries = new Map();
const templateEntries = new Map();
const addImpact = ({ scope, readable, impact, evidence }) => {
  const entries = scope === "template" ? templateEntries : objectEntries;
  const current = entries.get(readable.id) ?? {
    id: readable.id,
    token: readable.token,
    scope,
    flags: [],
    questUpdates: [],
  };
  if (impact.type === "flag") {
    const id = `${impact.kind}:${impact.flag.id}`;
    if (!current.flags.some((entry) => entry.id === id)) current.flags.push({ id, kind: impact.kind, flag: impact.flag, evidence: [] });
    current.flags.find((entry) => entry.id === id).evidence.push(evidence);
  } else {
    const id = `${impact.questId}:${impact.stateId}`;
    if (!current.questUpdates.some((entry) => entry.id === id)) current.questUpdates.push({
      id,
      questId: impact.questId,
      stateId: impact.stateId,
      conditional: Boolean(impact.conditional),
      ...(impact.triggerFlag ? { triggerFlag: impact.triggerFlag } : {}),
      evidence: [],
    });
    const questUpdate = current.questUpdates.find((entry) => entry.id === id);
    questUpdate.conditional = questUpdate.conditional && Boolean(impact.conditional);
    questUpdate.evidence.push(evidence);
  }
  entries.set(readable.id, current);
};

const questUpdatesByFlag = new Map();
for (const fact of statements) {
  if (fact.predicate !== "DB_QuestDef_State" && fact.predicate !== "DB_QuestDef_State_ConditionalFlag") continue;
  const triggerFlag = endpoint(fact.arguments[0] ?? "");
  const questId = stringArgument(fact.arguments[1] ?? "");
  const stateId = stringArgument(fact.arguments[2] ?? "");
  if (!triggerFlag || !questId || !stateId) continue;
  const entries = questUpdatesByFlag.get(triggerFlag.id) ?? [];
  entries.push({
    questId,
    stateId,
    conditional: fact.predicate === "DB_QuestDef_State_ConditionalFlag",
    triggerFlag,
    evidence: fact.evidence,
  });
  questUpdatesByFlag.set(triggerFlag.id, entries);
}

for (const fact of statements) {
  const definition = directDefinitions[fact.predicate];
  if (definition) {
    const readable = endpoint(fact.arguments[definition.objectIndex] ?? "");
    const flag = endpoint(fact.arguments[definition.flagIndex] ?? "");
    if (readable && flag) addImpact({
      scope: definition.scope,
      readable,
      impact: { type: "flag", kind: definition.impactKind, flag },
      evidence: fact.evidence,
    });
    if (readable && flag) {
      for (const questUpdate of questUpdatesByFlag.get(flag.id) ?? []) addImpact({
        scope: definition.scope,
        readable,
        impact: { type: "quest", ...questUpdate },
        evidence: questUpdate.evidence,
      });
    }
  }

  if (fact.predicate === "DB_QuestDef_BookReadState") {
    const questId = stringArgument(fact.arguments[0] ?? "");
    const stateId = stringArgument(fact.arguments[1] ?? "");
    const readable = endpoint(fact.arguments[2] ?? "");
    if (questId && stateId && readable) addImpact({
      scope: "object",
      readable,
      impact: { type: "quest", questId, stateId },
      evidence: fact.evidence,
    });
  }

  for (const fixedFlag of fixedFlagAliases[fact.predicate] ?? []) {
    const readable = endpoint(fact.arguments[0] ?? "");
    const flag = endpoint(fixedFlag);
    if (readable && flag) addImpact({
      scope: "object",
      readable,
      impact: { type: "flag", kind: "knowledge", flag },
      evidence: fact.evidence,
    });
    if (readable && flag) {
      for (const questUpdate of questUpdatesByFlag.get(flag.id) ?? []) addImpact({
        scope: "object",
        readable,
        impact: { type: "quest", ...questUpdate },
        evidence: questUpdate.evidence,
      });
    }
  }
}

const normalizeEntry = (entry) => ({
  ...entry,
  flags: entry.flags
    .map((impact) => ({ ...impact, evidence: impact.evidence.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en") || left.sourceLine - right.sourceLine) }))
    .sort((left, right) => left.id.localeCompare(right.id, "en")),
  questUpdates: entry.questUpdates
    .map((impact) => ({ ...impact, evidence: impact.evidence.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en") || left.sourceLine - right.sourceLine) }))
    .sort((left, right) => left.id.localeCompare(right.id, "en")),
});
const sortedObjectEntries = Object.fromEntries([...objectEntries]
  .sort(([left], [right]) => left.localeCompare(right, "en"))
  .map(([id, entry]) => [id, normalizeEntry(entry)]));
const sortedTemplateEntries = Object.fromEntries([...templateEntries]
  .sort(([left], [right]) => left.localeCompare(right, "en"))
  .map(([id, entry]) => [id, normalizeEntry(entry)]));
const allEntries = [...Object.values(sortedObjectEntries), ...Object.values(sortedTemplateEntries)];
const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    objectReadables: Object.keys(sortedObjectEntries).length,
    templateReadables: Object.keys(sortedTemplateEntries).length,
    flagImpacts: allEntries.reduce((total, entry) => total + entry.flags.length, 0),
    questUpdates: allEntries.reduce((total, entry) => total + entry.questUpdates.length, 0),
    mapReveals: allEntries.flatMap((entry) => entry.flags).filter(({ kind }) => kind === "map-reveal").length,
  },
  byObjectId: sortedObjectEntries,
  byTemplateId: sortedTemplateEntries,
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Readable impacts: ${catalog.stats.objectReadables} exact objects and ${catalog.stats.templateReadables} templates yield ${catalog.stats.flagImpacts} flags and ${catalog.stats.questUpdates} quest updates.`);
