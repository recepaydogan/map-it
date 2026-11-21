import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { listItemSourceFiles, readResolvedItemStats, isItemStatFile } from "./lib/native-item-stats.mjs";
import { splitStatExpressions } from "./lib/stat-expression-list.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 9) throw new Error("Usage: audit-stat-expression-content.mjs <native-stats> <native-items> <old-stats> <new-stats> <old-items> <new-items> <report>");
const [statsRoot, itemsRoot, oldStatsPath, statsPath, oldItemsPath, itemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const bytes = (file) => {
  const value = fs.readFileSync(file), key = relative(file);
  assert(!hashes[key] || hashes[key] === hash(value), `Changed input: ${key}`);
  hashes[key] = hash(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

// Independent of the producer's stack: mask quoted tokens, then repeatedly
// mask innermost groups. Surviving semicolons are top-level separators.
const independentParts = (value) => {
  let mask = value.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, (token) => " ".repeat(token.length));
  assert(!/["']/.test(mask), "Unterminated native quote");
  for (;;) {
    const next = mask.replace(/\([^()[\]{}]*\)|\[[^()[\]{}]*\]|\{[^()[\]{}]*\}/g, (token) => " ".repeat(token.length));
    if (next === mask) break;
    mask = next;
  }
  assert(!/[()[\]{}]/.test(mask), "Unbalanced native expression");
  const boundaries = [-1, ...[...mask.matchAll(/;/g)].map(({ index }) => index), value.length];
  return boundaries.slice(1).map((end, index) => value.slice(boundaries[index] + 1, end).trim()).filter(Boolean);
};

const oldStats = read(oldStatsPath), stats = read(statsPath), oldItems = read(oldItemsPath), items = read(itemsPath);
assert.deepEqual(omit(stats, ["entries"]), omit(oldStats, ["entries"]));
assert.deepEqual(Object.keys(stats.entries), Object.keys(oldStats.entries));
assert.deepEqual(omit(items, ["generatedAt"]), omit(oldItems, ["generatedAt"]), "Expression fix changed complete item or acquisition data");
assert(Number.isFinite(Date.parse(items.generatedAt)));
const fields = ["DescriptionParams", "Boosts", "DefaultBoosts", "PassivesOnEquip", "Requirements", "ComboCategory", "Weapon Properties", "Proficiency Group", "Passives", "PersonalStatusImmunities", "ActionResources"];
const sourceStats = new Map(), sources = [], malformedSourceFields = [];
for (const [sourceRoot, predicate] of [[statsRoot, (file) => file.endsWith(".txt")], [itemsRoot, isItemStatFile]]) {
  const files = listItemSourceFiles(sourceRoot, predicate);
  for (const file of files) bytes(file);
  const resolved = readResolvedItemStats(files, sourceRoot);
  sourceStats.set(sourceRoot, resolved);
  let fieldCount = 0, correctedFields = 0;
  for (const entry of resolved.values()) for (const field of fields) {
    const value = entry.data[field]; if (!value) continue;
    fieldCount++;
    let expected;
    try { expected = independentParts(value); }
    catch (error) {
      assert(error instanceof assert.AssertionError);
      assert.throws(() => splitStatExpressions(value), /Unmatched bracket|Unterminated expression/);
      const file = path.join(sourceRoot, entry.provenance);
      const lines = bytes(file).toString("utf8").split(/\r?\n/);
      const declaration = lines.findIndex((line) => line === `new entry "${entry.id}"`);
      const fieldLine = lines.findIndex((line, index) => index > declaration && line.startsWith(`data "${field}" `));
      assert(declaration >= 0 && fieldLine > declaration);
      assert(!lines.slice(declaration + 1, fieldLine).some((line) => line.startsWith("new entry ")));
      const referencedItems = items.items.filter((item) => JSON.stringify(item).includes(entry.id)).map(({ id }) => id);
      assert.equal(referencedItems.length, 0, "Malformed source affects current item output and needs explicit handling");
      malformedSourceFields.push({ sourcePath: relative(file), sourceLine: fieldLine + 1, statsId: entry.id, field, value, referencedItems });
      continue;
    }
    assert.deepEqual(splitStatExpressions(value), expected, `${entry.id}/${field}`);
    if (!isDeepStrictEqual(expected, value.split(";").map((part) => part.trim()).filter(Boolean))) correctedFields++;
  }
  sources.push({ sourceRoot: relative(sourceRoot), files: files.length, entries: resolved.size, fieldCount, correctedFields });
}
const changes = [], sourceResolutionDifferences = [];
for (const [id, next] of Object.entries(stats.entries)) {
  const previous = oldStats.entries[id], source = sourceStats.get(statsRoot).get(id);
  assert(source, `Missing native stat: ${id}`);
  assert.deepEqual(omit(next, ["boosts"]), omit(previous, ["boosts"]), `Unrelated stat change: ${id}`);
  const value = source.data.Boosts || source.data.DefaultBoosts || "";
  const nativeParts = independentParts(value);
  assert.deepEqual(next.boosts, independentParts(previous.boosts.join(";")), `Expression reconstruction mismatch: ${id}`);
  if (!isDeepStrictEqual(next.boosts, nativeParts)) {
    // An existing inheritance disagreement is a separate open defect, never
    // evidence that this delimiter correction matches the entire source model.
    assert.deepEqual(next, previous, `Changed stat lacks native agreement: ${id}`);
    sourceResolutionDifferences.push({ id, catalogBoosts: next.boosts, nativeReaderBoosts: nativeParts, sourceValue: value, provenance: source.provenance });
  } else {
    assert.deepEqual(previous.boosts, value.split(";").map((part) => part.trim()).filter(Boolean));
  }
  if (!isDeepStrictEqual(next.boosts, previous.boosts)) changes.push({ id, before: previous.boosts, after: next.boosts, sourceValue: value, provenance: next.provenance });
}
for (const file of [import.meta.filename, "scripts/lib/stat-expression-list.mjs", "scripts/lib/native-item-stats.mjs", "scripts/build-gameplay-stat-catalog.mjs", "scripts/build-item-database.mjs"]) bytes(path.resolve(root, file));
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "native-stat-expression-content-audit", errors: [], statsPath, oldStatsPath, itemsPath, oldItemsPath, sources,
  stats: { gameplayEntries: Object.keys(stats.entries).length, changedBoostRecords: changes.length, items: items.items.length, acquisitions: items.stats.acquisitionRecords },
  changes, malformedSourceFields, sourceResolutionDifferences, hashes,
  scope: "Complete gameplay records differ only in native-proven boost list boundaries. All item facts and acquisition records remain identical. Independent delimiter reconstruction covers every selected resolved native field, with malformed unused native descriptions and unchanged inheritance disagreements reported explicitly. Does not certify module precedence, all spell presentation, pin routing, publication or whole-game coverage." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, sources, malformedSourceFields: malformedSourceFields.length, sourceResolutionDifferences: sourceResolutionDifferences.length }, null, 2));
