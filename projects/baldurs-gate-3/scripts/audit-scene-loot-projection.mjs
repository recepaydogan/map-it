import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Data-only projection of real staged records through the UI's pure selectors.
// This does not launch the app, render a browser, or run a test suite.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 5) throw new Error("Usage: audit-scene-loot-projection.mjs <scene-stage> <items> <report>");
const stage = path.resolve(root, process.argv[2]), hashes = {};
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).split(path.sep).join("/")] = createHash("sha256").update(value).digest("hex");
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const manifest = read(path.join(stage, "stage-manifest.json")), { items } = read(process.argv[3]);
const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
  'export { getMapLootRows } from "./src/features/map/map-loot-utils"; export { getMapLootDisplayRows } from "./src/features/map/map-loot-display-rows";' },
bundle: true, platform: "node", format: "esm", write: false, metafile: true });
for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") bytes(file);
const { getMapLootRows, getMapLootDisplayRows } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const omitCertainty = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["certainty", "chance"].includes(key))))
  .sort((a, b) => a.id.localeCompare(b.id));
let appearances = 0, unchangedProfiles = 0;
const entries = [];
for (const mapId of manifest.maps) {
  const before = read(path.join(stage, "baseline/maps", mapId, "content.json"));
  const after = read(path.join(stage, "public/maps", mapId, "content.json"));
  const byId = new Map(Object.values(after.entities).map((entity) => [entity.id, entity]));
  for (const old of Object.values(before.entities)) {
    appearances++;
    const current = byId.get(old.id);
    assert(current, `Lost pin ${mapId}/${old.id}`);
    const oldRows = getMapLootRows(old.deathLoot, old.containerLoot);
    const newRows = getMapLootRows(current.deathLoot, current.containerLoot);
    if (!current.deathLoot?.availability) {
      assert.deepEqual(newRows, oldRows);
      unchangedProfiles++;
      continue;
    }
    assert(!current.containerLoot, "A mixed conditional/unconditional inventory needs separate quantity review");
    assert.deepEqual(omitCertainty(newRows), omitCertainty(oldRows), "Scene conditions lost raw item identities or amounts");
    assert(newRows.length && newRows.every(({ certainty, chance }) => certainty === "conditional" && chance === undefined), "Conditional loot still shows guaranteed/numerical odds");
    const oldDisplay = getMapLootDisplayRows(oldRows, items), newDisplay = getMapLootDisplayRows(newRows, items);
    assert.deepEqual(omitCertainty(newDisplay), omitCertainty(oldDisplay), "Scene condition changed linked item identities or amounts");
    assert(newDisplay.length && newDisplay.every(({ certainty, chance }) => certainty === "conditional" && chance === undefined));
    entries.push({ mapId, contentId: old.id, rawRows: newRows.length, linkedItems: newDisplay.map(({ item }) => ({ id: item.id, name: item.name })) });
  }
}
assert.equal(entries.length, manifest.matches.length);
for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), expected);
const report = { kind: "scene-loot-data-projection-audit", errors: [],
  scope: "Real data through pure loot selectors only. Does not certify rendering, input behavior, unresolved native stock identities or mixed conditional container quantities.",
  stats: { maps: manifest.maps.length, appearances, unchangedProfiles, conditionalProfiles: entries.length,
    rawConditionalRows: entries.reduce((sum, entry) => sum + entry.rawRows, 0),
    linkedConditionalRows: entries.reduce((sum, entry) => sum + entry.linkedItems.length, 0) }, entries, hashes };
writeGeneratedFile(path.resolve(root, process.argv[4]), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
