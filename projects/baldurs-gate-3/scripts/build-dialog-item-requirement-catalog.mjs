import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "dialog-item-requirements.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

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
    if (character === "\"" || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
};

const stripCast = (value) => value.replace(/^\([A-Z]+\)/, "").trim();
const extractGuid = (value) => value.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US");
const stripGuid = (value) => stripCast(value)
  .replace(new RegExp(`_${guidPattern.source}$`, "i"), "")
  .replace(/^DIALOGRESOURCEGUID_/i, "");

const readCalls = (source) => {
  const calls = [];
  for (const match of source.matchAll(/\bDB_HasItemTemplateScriptFlag\s*\(/gi)) {
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
    calls.push({
      arguments: splitArguments(source.slice(argumentStart, argumentEnd)),
      sourceLine: source.slice(0, match.index).split("\n").length,
      statement: source.slice(match.index, argumentEnd + 1).replace(/\s+/g, " "),
    });
  }
  return calls;
};

const records = [];
let files = 0;
let rawCalls = 0;
for (const filePath of walkFiles(storyRoot)
  .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))
  .filter((candidate) => !/SavegamePatches/i.test(candidate))) {
  files += 1;
  const source = maskComments(fs.readFileSync(filePath, "utf8"));
  for (const call of readCalls(source)) {
    rawCalls += 1;
    if (call.arguments.length < 4) continue;
    const dialogId = extractGuid(call.arguments[1]);
    const itemTemplateId = extractGuid(call.arguments[2]);
    if (!dialogId || !itemTemplateId) continue;
    const dialogFlagValue = Number(call.arguments[3]);
    const amount = Number(call.arguments[4] ?? 1);
    const scriptFlagIndex = Number(call.arguments[0]);
    records.push({
      id: `${dialogId}:${scriptFlagIndex}:${itemTemplateId}:${Number.isFinite(amount) ? amount : 1}`,
      dialogId,
      dialogToken: stripCast(call.arguments[1]),
      dialogResourceName: stripGuid(call.arguments[1]),
      itemTemplateId,
      itemToken: stripGuid(call.arguments[2]),
      scriptFlagIndex,
      dialogFlagValue: Number.isFinite(dialogFlagValue) ? dialogFlagValue : undefined,
      amount: Number.isInteger(amount) && amount > 0 ? amount : 1,
      evidence: {
        sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
        sourceLine: call.sourceLine,
        statement: call.statement,
      },
    });
  }
}

const entries = [...new Map(records.map((record) => [record.id, record])).values()]
  .sort((left, right) => left.dialogResourceName.localeCompare(right.dialogResourceName, "en")
    || left.itemTemplateId.localeCompare(right.itemTemplateId, "en"));
const byDialogResourceName = Object.fromEntries(Map.groupBy(
  entries,
  ({ dialogResourceName }) => dialogResourceName.toLocaleLowerCase("en-US"),
));

fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    files,
    rawCalls,
    requirements: entries.length,
    dialogItemPairs: new Set(entries.map(({ dialogId, itemTemplateId }) => `${dialogId}:${itemTemplateId}`)).size,
    dialogs: Object.keys(byDialogResourceName).length,
    tieredRequirements: entries.filter(({ amount }) => amount > 1).length,
  },
  entries,
  byDialogResourceName,
}, null, 2)}\n`, "utf8");

console.log(`Dialogue item requirements: ${entries.length} exact item requirements across ${Object.keys(byDialogResourceName).length} dialog resources.`);
