import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-placed-item-source-duplicates.mjs <map-stage> <item-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, ".."), [stage, itemStage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const read = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)); hashes[relative(file)] = digest(data); return JSON.parse(data);
};
hashes[relative(import.meta.filename)] = digest(fs.readFileSync(import.meta.filename));
const manifest = read(path.join(stage, "stage-manifest.json"));
const resolution = read(path.join(itemStage, "placed-item-identity-resolution.json"));
const published = new Set(read(path.join(itemStage, "item-database.json")).items.map((item) => item.id));
const wanted = new Map(resolution.entries.map((entry) => [entry.item.generation.sourceObjectId, entry]));
const variants = new Map(); let nativeFiles = 0, occurrences = 0;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".lsj") ? [path.join(dir, entry.name)] : []);
for (const dir of manifest.placementRoots) for (const file of walk(dir)) {
  nativeFiles++;
  for (const object of read(file).save?.regions?.Templates?.GameObjects ?? []) {
    const id = object.MapKey?.value; if (!wanted.has(id)) continue; occurrences++;
    const identity = Object.fromEntries(["TemplateName", "Stats", "DisplayName", "Description", "Icon"]
      .filter((key) => Object.hasOwn(object, key)).map((key) => [key, object[key]]));
    const values = variants.get(id) ?? [], current = values.find((value) => isDeepStrictEqual(value.identity, identity));
    if (current) current.sourcePaths.push(relative(file));
    else values.push({ identity, sourcePaths: [relative(file)] });
    variants.set(id, values);
  }
}
assert.equal(variants.size, wanted.size);
const conflicts = [];
for (const [objectId, values] of variants) {
  const entry = wanted.get(objectId);
  assert(values.some((value) => value.sourcePaths.includes(entry.item.generation.sourcePath)));
  if (values.length < 2) continue;
  // Do not silently choose one module's identity for an obtainable item.
  assert.equal(entry.status, "unlinked-source-object", `Ambiguous linked item source: ${objectId}`);
  assert(!published.has(entry.item.id));
  conflicts.push({ objectId, itemId: entry.item.id, name: entry.item.name, status: "unlinked-native-identity-review", variants: values });
}
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected);
const report = { kind: "independent-placed-item-source-duplicate-audit", stage, itemStage,
  stats: { nativeFiles, identities: wanted.size, occurrences, repeatedOccurrences: occurrences - wanted.size,
    linkedIdentities: resolution.entries.filter((entry) => entry.status === "linked-item").length, linkedConflicts: 0, unlinkedConflicts: conflicts.length },
  conflicts, errors: [], hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
