import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "item-story-impacts.json");
const emptyGuid = "00000000-0000-0000-0000-000000000000";
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const definitions = {
  DB_HasItemEvent: { scope: "object", itemIndex: 0, flagIndex: 1, kind: "carrying" },
  DB_GiveItemToEvent: { scope: "object", itemIndex: 0, flagIndex: 1, kind: "hand-in" },
  DB_GiveItemToEventWithClear: { scope: "object", itemIndex: 0, flagIndex: 1, kind: "hand-in" },
  DB_PlayerHasTemplateItem: { scope: "template", itemIndex: 0, flagIndex: 1, kind: "carrying" },
  DB_GiveTemplateFromPlayerDialogEvent: { scope: "template", itemIndex: 0, flagIndex: 1, kind: "hand-in" },
  DB_RemoveItemFromTemplateEvent: { scope: "template", itemIndex: 0, flagIndex: 1, kind: "hand-in" },
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

const questUpdatesByFlag = new Map();
for (const fact of statements) {
  if (fact.predicate !== "DB_QuestDef_State" && fact.predicate !== "DB_QuestDef_State_ConditionalFlag") continue;
  const triggerFlag = endpoint(fact.arguments[0] ?? "");
  const questId = stringArgument(fact.arguments[1] ?? "");
  const stateId = stringArgument(fact.arguments[2] ?? "");
  if (!triggerFlag || !questId || !stateId) continue;
  const entries = questUpdatesByFlag.get(triggerFlag.id) ?? [];
  entries.push({
    id: `${questId}:${stateId}`,
    questId,
    stateId,
    conditional: fact.predicate === "DB_QuestDef_State_ConditionalFlag",
    triggerFlag,
    evidence: fact.evidence,
  });
  questUpdatesByFlag.set(triggerFlag.id, entries);
}

const objectEntries = new Map();
const templateEntries = new Map();
for (const fact of statements) {
  const definition = definitions[fact.predicate];
  if (!definition) continue;
  const item = endpoint(fact.arguments[definition.itemIndex] ?? "");
  const flag = endpoint(fact.arguments[definition.flagIndex] ?? "");
  if (!item || !flag) continue;
  const entries = definition.scope === "template" ? templateEntries : objectEntries;
  const current = entries.get(item.id) ?? {
    id: item.id,
    token: item.token,
    scope: definition.scope,
    carryingFlags: [],
    handIns: [],
    questUpdates: [],
  };
  const collection = definition.kind === "carrying" ? current.carryingFlags : current.handIns;
  if (!collection.some((impact) => impact.flag.id === flag.id)) collection.push({ flag, evidence: [] });
  collection.find((impact) => impact.flag.id === flag.id).evidence.push(fact.evidence);
  for (const update of questUpdatesByFlag.get(flag.id) ?? []) {
    const id = `${definition.kind}:${update.id}`;
    if (!current.questUpdates.some((impact) => impact.id === id)) current.questUpdates.push({
      ...update,
      id,
      trigger: definition.kind,
      evidence: [],
    });
    const questUpdate = current.questUpdates.find((impact) => impact.id === id);
    questUpdate.evidence.push(fact.evidence, update.evidence);
  }
  entries.set(item.id, current);
}

const normalizeEvidence = (values) => [...new Map(values.map((evidence) => [
  `${evidence.sourcePath}:${evidence.sourceLine}:${evidence.statement}`,
  evidence,
])).values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en") || left.sourceLine - right.sourceLine);
const normalizeEntry = (entry) => ({
  ...entry,
  carryingFlags: entry.carryingFlags
    .map((impact) => ({ ...impact, evidence: normalizeEvidence(impact.evidence) }))
    .sort((left, right) => left.flag.id.localeCompare(right.flag.id, "en")),
  handIns: entry.handIns
    .map((impact) => ({ ...impact, evidence: normalizeEvidence(impact.evidence) }))
    .sort((left, right) => left.flag.id.localeCompare(right.flag.id, "en")),
  questUpdates: entry.questUpdates
    .map((impact) => ({ ...impact, evidence: normalizeEvidence(impact.evidence) }))
    .sort((left, right) => left.id.localeCompare(right.id, "en")),
});
const toObject = (entries) => Object.fromEntries([...entries]
  .sort(([left], [right]) => left.localeCompare(right, "en"))
  .map(([id, entry]) => [id, normalizeEntry(entry)]));
const byObjectId = toObject(objectEntries);
const byTemplateId = toObject(templateEntries);
const allEntries = [...Object.values(byObjectId), ...Object.values(byTemplateId)];
const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    exactItems: Object.keys(byObjectId).length,
    itemTemplates: Object.keys(byTemplateId).length,
    carryingLinks: allEntries.reduce((total, entry) => total + entry.carryingFlags.length, 0),
    handInLinks: allEntries.reduce((total, entry) => total + entry.handIns.length, 0),
    questUpdates: allEntries.reduce((total, entry) => total + entry.questUpdates.length, 0),
  },
  byObjectId,
  byTemplateId,
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Item story impacts: ${catalog.stats.exactItems} exact items and ${catalog.stats.itemTemplates} templates yield ${catalog.stats.carryingLinks} carrying and ${catalog.stats.handInLinks} hand-in links.`);
