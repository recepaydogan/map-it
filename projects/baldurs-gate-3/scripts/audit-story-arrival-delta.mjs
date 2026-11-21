import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readStoryFacts } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.resolve(root, process.argv[2] ?? "map-sources/catalog/story-location-relations.json");
const afterPath = path.resolve(root, process.argv[3] ?? "map-sources/audits/story-locations-shared-effects.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath);
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const key = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
const facts = readStoryFacts([
  path.join(root, "map-sources/extracted/story-goals"),
  path.join(root, "map-sources/extracted/story-support/shared"),
], root);
const activeEvidence = new Set(facts.filter(({ negated }) => !negated).map(({ evidence }) => key(evidence)));
const allowedKeys = new Set(["scriptedDestinations", "scriptedDestinationsByCharacterId"]);
for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!allowedKeys.has(field)) check(isDeepStrictEqual(before[field], after[field]), `Unrelated catalog field changed: ${field}`);
}
const previousRows = new Map(before.scriptedDestinations.map((row) => [row.id, row]));
const nextRows = new Map(after.scriptedDestinations.map((row) => [row.id, row]));
check(previousRows.size === before.scriptedDestinations.length, "Duplicate previous relation IDs");
check(nextRows.size === after.scriptedDestinations.length, "Duplicate staged relation IDs");
check(isDeepStrictEqual([...previousRows.keys()], [...nextRows.keys()]), "Movement relation IDs or order changed");
const changes = [];
for (const [id, row] of nextRows) {
  const previous = previousRows.get(id);
  if (!previous || isDeepStrictEqual(previous, row)) continue;
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(row)])]
    .filter((field) => !isDeepStrictEqual(previous[field], row[field]));
  check(fields.every((field) => ["arrivalState", "arrivalEvidence"].includes(field)), `Movement or actor fields changed: ${id}`);
  check(previous.arrivalState === row.arrivalState || previous.arrivalState === "unspecified" && row.arrivalState === "corpse",
    `Unexpected arrival-state change: ${id}`);
  for (const evidence of row.arrivalEvidence) check(activeEvidence.has(key(evidence)), `Inactive or missing source statement: ${key(evidence)}`);
  if (row.arrivalState === "corpse") check(row.arrivalEvidence.some(({ statement }) => statement.startsWith("Die(")), `Missing explicit death evidence: ${id}`);
  changes.push({ id, character: row.character, anchor: row.anchor, fields,
    beforeState: previous.arrivalState, afterState: row.arrivalState, evidence: row.arrivalEvidence });
}
const grouped = { ...Object.groupBy(after.scriptedDestinations, ({ character }) => character.id) };
check(isDeepStrictEqual(grouped, after.scriptedDestinationsByCharacterId), "Staged character index disagrees with relation rows");
const sourcePaths = [...new Set(changes.flatMap(({ evidence }) => evidence.map(({ sourcePath }) => sourcePath)))];
const report = {
  scope: "Complete catalog delta and active source-statement integrity; semantic effect/argument binding still requires source review. Not a coverage verdict.",
  beforePath, afterPath, hashes: { before: hash(beforePath), after: hash(afterPath) },
  sourceHashes: Object.fromEntries(sourcePaths.map((file) => [file, hash(path.join(root, file))])),
  relationCount: after.scriptedDestinations.length, changes, errors,
};
writeGeneratedFile(path.join(root, "map-sources/audits/story-arrival-delta.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ relations: report.relationCount, changes: changes.map(({ id, beforeState, afterState }) => ({ id, beforeState, afterState })), errors }, null, 2));
if (errors.length) process.exitCode = 1;
