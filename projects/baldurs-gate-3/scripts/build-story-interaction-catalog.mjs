import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const dialogRoot = path.join(projectRoot, "map-sources", "extracted", "dialogs");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "story-interactions.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const emptyGuid = "00000000-0000-0000-0000-000000000000";

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
  const entries = new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  for (const match of xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)) {
    entries.set(match[1], stripLocalizationMarkup(match[2]));
  }
  return entries;
};
const collectHandles = (value, output = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectHandles(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (typeof value.handle === "string" && value.handle) output.push(value.handle);
  for (const nested of Object.values(value)) collectHandles(nested, output);
  return output;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const stripComment = (value) => {
  const commentIndex = value.indexOf("//");
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
};
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
  if (current.trim()) output.push(current.trim());
  return output;
};

const endpoint = (argument) => {
  const cast = argument.match(/^\(([A-Z]+)\)/)?.[1]?.toLocaleLowerCase("en-US") ?? null;
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const id = token.match(new RegExp(`(?:^|_)(${guidPattern.source})$`, "i"))?.[1]?.toLocaleLowerCase("en-US");
  if (!id || id === emptyGuid) return null;
  return { id, token, cast };
};

const parseStatement = (lines, startIndex) => {
  let index = startIndex;
  let statement = stripComment(lines[index]);
  statement = statement.replace(/^(?:AND|NOT)\s+/, "").trim();
  if (!/^[A-Za-z0-9_]+\s*\(/.test(statement)) return null;
  let balance = [...statement].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
  while (balance > 0 && index + 1 < lines.length) {
    index += 1;
    const next = stripComment(lines[index]);
    statement += ` ${next}`;
    balance += [...next].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
  }
  const closingIndex = statement.lastIndexOf(")");
  if (closingIndex < 0) return null;
  statement = statement.slice(0, closingIndex + 1).replace(/\s+/g, " ");
  return {
    endIndex: index,
    predicate: statement.match(/^([A-Za-z0-9_]+)\s*\(/)[1],
    arguments: splitArguments(statement),
    statement,
  };
};

const parseBlocks = (filePath) => {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const kind = lines[index].trim();
    if (!["IF", "PROC", "QRY"].includes(kind)) continue;
    const conditions = [];
    let cursor = index + 1;
    for (; cursor < lines.length && lines[cursor].trim() !== "THEN"; cursor += 1) {
      const parsed = parseStatement(lines, cursor);
      if (!parsed) continue;
      conditions.push({
        ...parsed,
        evidence: {
          sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
          sourceLine: cursor + 1,
          statement: parsed.statement,
        },
      });
      cursor = parsed.endIndex;
    }
    if (cursor >= lines.length || lines[cursor].trim() !== "THEN") continue;
    const actions = [];
    cursor += 1;
    for (; cursor < lines.length; cursor += 1) {
      const trimmed = lines[cursor].trim();
      if (["IF", "PROC", "QRY", "KBSECTION", "EXITSECTION"].includes(trimmed)) break;
      if (!trimmed) {
        if (actions.length > 0) break;
        continue;
      }
      const parsed = parseStatement(lines, cursor);
      if (!parsed) continue;
      actions.push({
        ...parsed,
        evidence: {
          sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
          sourceLine: cursor + 1,
          statement: parsed.statement,
        },
      });
      cursor = parsed.endIndex;
    }
    if (conditions.length > 0 && actions.length > 0) blocks.push({ kind, conditions, actions });
    index = cursor - 1;
  }
  return blocks;
};

const storyFiles = walkFiles(storyRoot)
  .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))
  .filter((candidate) => !/SavegamePatches/i.test(candidate));
const blocks = storyFiles.flatMap(parseBlocks);
const procedures = Map.groupBy(
  blocks.filter(({ kind }) => kind === "PROC"),
  ({ conditions }) => conditions[0]?.predicate ?? "",
);

const directOutcome = (statement) => {
  if (/^(?:QRY_.*StartDialog|QRY_StartDialog|QRY_StartDialog_Fixed|PROC_TryStartAD)$/i.test(statement.predicate)) {
    const dialog = statement.arguments.map(endpoint).find((value) => value?.cast === "dialogresource")
      ?? statement.arguments.map(endpoint).find(Boolean);
    return dialog ? { kind: "starts-dialogue", dialog, evidence: [statement.evidence] } : null;
  }
  const targetAction = ({
    Open: "opens",
    Unlock: "unlocks",
    Close: "closes",
    Lock: "locks",
  })[statement.predicate];
  if (targetAction) {
    const target = endpoint(statement.arguments[0] ?? "");
    return target ? { kind: targetAction, target, evidence: [statement.evidence] } : null;
  }
  if (statement.predicate === "SetCanInteract") {
    const target = endpoint(statement.arguments[0] ?? "");
    const enabled = Number(statement.arguments[1]);
    if (!target || ![0, 1].includes(enabled)) return null;
    return { kind: enabled === 1 ? "enables-interaction" : "disables-interaction", target, evidence: [statement.evidence] };
  }
  if (statement.predicate === "SetEntityEvent" && statement.arguments[1]?.replaceAll('"', "") === "RevealFromStory") {
    const target = endpoint(statement.arguments[0] ?? "");
    return target ? { kind: "reveals", target, evidence: [statement.evidence] } : null;
  }
  if (statement.predicate === "QuestUpdate") {
    const questId = statement.arguments[0]?.match(/^"([^"]+)"$/)?.[1];
    const stateId = statement.arguments[1]?.match(/^"([^"]+)"$/)?.[1];
    return questId && stateId ? { kind: "quest-update", questId, stateId, evidence: [statement.evidence] } : null;
  }
  return null;
};

const collectOutcomes = (statements, depth = 0, visited = new Set()) => {
  const outcomes = [];
  for (const statement of statements) {
    const direct = directOutcome(statement);
    if (direct) {
      outcomes.push(direct);
      continue;
    }
    if (
      depth >= 4
      || statement.arguments.length > 0
      || !/^(?:PROC_|QRY_)/.test(statement.predicate)
      || visited.has(statement.predicate)
    ) continue;
    const definitions = procedures.get(statement.predicate) ?? [];
    const nextVisited = new Set([...visited, statement.predicate]);
    for (const definition of definitions) {
      if ((definition.conditions[0]?.arguments.length ?? 0) > 0) continue;
      for (const outcome of collectOutcomes(definition.actions, depth + 1, nextVisited)) {
        outcomes.push({ ...outcome, evidence: [statement.evidence, ...outcome.evidence] });
      }
    }
  }
  return outcomes;
};

const usePredicatePattern = /^(?:UseFinished|UseStarted|Used|PROC_BlockUseOfItem)$/i;
const interactions = new Map();
let narratorDialogRegistrations = 0;
for (const filePath of storyFiles) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*(?:NOT\s+)?DB_ItemDialog_NarratorAD\s*\(/i.test(stripComment(lines[index]))) continue;
    const statement = parseStatement(lines, index);
    if (!statement || statement.predicate !== "DB_ItemDialog_NarratorAD") continue;
    const item = statement.arguments.map(endpoint).find((value) => value?.cast === "item")
      ?? endpoint(statement.arguments[0] ?? "");
    const dialog = statement.arguments.map(endpoint).find((value) => value?.cast === "dialogresource")
      ?? endpoint(statement.arguments[1] ?? "");
    if (!item || !dialog || /debug|dummy|test/i.test(item.token)) continue;
    narratorDialogRegistrations += 1;
    const evidence = {
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement: statement.statement,
    };
    const current = interactions.get(item.id) ?? {
      objectId: item.id,
      token: item.token,
      triggerPredicates: [],
      outcomes: [],
      evidence: [],
    };
    current.triggerPredicates.push("DB_ItemDialog_NarratorAD");
    current.outcomes.push({ kind: "starts-dialogue", dialog, evidence: [evidence] });
    current.evidence.push(evidence);
    interactions.set(item.id, current);
    index = statement.endIndex;
  }
}
for (const block of blocks.filter(({ kind }) => kind === "IF" || kind === "PROC")) {
  const controllerStatements = block.conditions.filter(({ predicate }) => usePredicatePattern.test(predicate));
  if (controllerStatements.length === 0) continue;
  const outcomes = collectOutcomes(block.actions);
  if (outcomes.length === 0) continue;
  for (const controllerStatement of controllerStatements) {
    const controllers = controllerStatement.arguments
      .map(endpoint)
      .filter((value) => value?.cast === "item");
    for (const controller of controllers) {
      if (/debug|dummy|test/i.test(controller.token)) continue;
      const filteredOutcomes = outcomes.filter((outcome) => outcome.target?.id !== controller.id);
      if (filteredOutcomes.length === 0) continue;
      const current = interactions.get(controller.id) ?? {
        objectId: controller.id,
        token: controller.token,
        triggerPredicates: [],
        outcomes: [],
        evidence: [],
      };
      current.triggerPredicates.push(controllerStatement.predicate);
      current.outcomes.push(...filteredOutcomes);
      current.evidence.push(controllerStatement.evidence);
      interactions.set(controller.id, current);
    }
  }
}

const outcomeKey = (outcome) => [outcome.kind, outcome.dialog?.id, outcome.target?.id, outcome.questId, outcome.stateId].join(":");
const localization = {
  en: readLocalization(path.join(projectRoot, "map-sources", "converted", "localization", "english", "english.xml")),
  tr: readLocalization(path.join(projectRoot, "map-sources", "converted", "localization", "turkish", "turkish.xml")),
};
const dialogFilesByName = Map.groupBy(
  walkFiles(dialogRoot).filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj")),
  (filePath) => path.basename(filePath, ".lsj").toLocaleLowerCase("en-US"),
);
const dialogDetailsCache = new Map();
let localizedDialogOutcomes = 0;
const resolveDialogDetails = (dialog) => {
  const resourceName = dialog.token.replace(new RegExp(`_${guidPattern.source}$`, "i"), "");
  if (dialogDetailsCache.has(resourceName)) return dialogDetailsCache.get(resourceName);
  const candidates = dialogFilesByName.get(resourceName.toLocaleLowerCase("en-US")) ?? [];
  const localizedLines = [];
  for (const filePath of candidates) {
    const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const nodes = (document?.save?.regions?.dialog?.nodes ?? []).flatMap((container) => container.node ?? []);
    const seen = new Set();
    for (const node of nodes) {
      for (const handle of collectHandles(node.TaggedTexts)) {
        if (seen.has(handle)) continue;
        seen.add(handle);
        const line = Object.fromEntries(Object.entries({
          en: localization.en.get(handle),
          tr: localization.tr.get(handle),
        }).filter(([, value]) => value));
        if (Object.keys(line).length > 0) localizedLines.push(line);
      }
    }
    if (localizedLines.length > 0) break;
  }
  const details = {
    resourceName,
    ...(localizedLines.length > 0 ? { localizedLines } : {}),
  };
  dialogDetailsCache.set(resourceName, details);
  return details;
};
const entries = [...interactions.values()].map((entry) => ({
  ...entry,
  triggerPredicates: [...new Set(entry.triggerPredicates)].sort((left, right) => left.localeCompare(right, "en")),
  outcomes: [...new Map(entry.outcomes.map((outcome) => [outcomeKey(outcome), outcome])).values()]
    .map((outcome) => {
      if (!outcome.dialog) return outcome;
      const details = resolveDialogDetails(outcome.dialog);
      if (details.localizedLines?.length > 0) localizedDialogOutcomes += 1;
      return { ...outcome, dialog: { ...outcome.dialog, ...details } };
    })
    .sort((left, right) => outcomeKey(left).localeCompare(outcomeKey(right), "en")),
  evidence: [...new Map(entry.evidence.map((evidence) => [`${evidence.sourcePath}:${evidence.sourceLine}`, evidence])).values()],
})).sort((left, right) => left.objectId.localeCompare(right.objectId, "en"));

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    parsedBlocks: blocks.length,
    procedureDefinitions: [...procedures.values()].reduce((total, definitions) => total + definitions.length, 0),
    narratorDialogRegistrations,
    interactionObjects: entries.length,
    outcomes: entries.reduce((total, entry) => total + entry.outcomes.length, 0),
    dialogueOutcomes: entries.flatMap(({ outcomes }) => outcomes).filter(({ kind }) => kind === "starts-dialogue").length,
    localizedDialogueOutcomes: localizedDialogOutcomes,
    targetOutcomes: entries.flatMap(({ outcomes }) => outcomes).filter(({ target }) => target).length,
    questOutcomes: entries.flatMap(({ outcomes }) => outcomes).filter(({ kind }) => kind === "quest-update").length,
  },
  entries,
  byObjectId: Object.fromEntries(entries.map((entry) => [entry.objectId, entry])),
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Story interactions: ${catalog.stats.interactionObjects} exact use targets with ${catalog.stats.outcomes} possible outcomes.`);
