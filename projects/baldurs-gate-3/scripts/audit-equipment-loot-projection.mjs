import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 5) throw new Error("Usage: audit-equipment-loot-projection.mjs <stage> <items> <report>");
const stage = path.resolve(root, process.argv[2]), hashes = {};
const readBytes = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).split(path.sep).join("/")] = createHash("sha256").update(bytes).digest("hex");
  return bytes;
};
const read = (file) => JSON.parse(readBytes(file).toString("utf8"));
const manifest = read(path.join(stage, "stage-manifest.json")), { items } = read(process.argv[3]);
const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
  'export { getMapLootRows } from "./src/features/map/map-loot-utils"; export { getMapLootDisplayRows } from "./src/features/map/map-loot-display-rows";' },
bundle: true, platform: "node", format: "esm", write: false, metafile: true });
for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") readBytes(file);
const { getMapLootRows, getMapLootDisplayRows } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
let appearances = 0, lootAppearances = 0, displayedEquipmentRows = 0;
for (const mapId of manifest.maps) {
  const before = read(path.join(manifest.source, mapId, "content.json"));
  const after = read(path.join(stage, "public/maps", mapId, "content.json"));
  const originals = new Map(Object.values(before.entities).map((entity) => [entity.id, entity]));
  for (const entity of Object.values(after.entities)) {
    appearances++;
    const added = entity.deathLoot?.guaranteedDrops.filter((drop) => drop.equipmentSource) ?? [];
    const old = originals.get(entity.id); assert(old);
    const rows = getMapLootRows(entity.deathLoot, entity.containerLoot), oldRows = getMapLootRows(old.deathLoot, old.containerLoot);
    if (!added.length) { assert.deepEqual(rows, oldRows); continue; }
    lootAppearances++;
    const display = getMapLootDisplayRows(rows, items);
    const displayed = new Map(display.map((row) => [row.item.id, row]));
    for (const drop of added) {
      const row = displayed.get(drop.equipmentSource.itemId);
      assert(row, `Equipment missing from actual loot selector ${mapId}/${entity.id}/${drop.statsId}`);
      assert.equal(row.item.statsId, drop.statsId); assert(row.item.templateIds.includes(drop.templateId));
      assert.equal(row.amount, drop.amount); assert.equal(row.certainty, "guaranteed"); assert.equal(row.chance, 100);
      displayedEquipmentRows++;
    }
    const oldDisplay = getMapLootDisplayRows(oldRows, items);
    for (const oldRow of oldDisplay) assert(displayed.has(oldRow.item.id), `Pre-existing displayed loot disappeared ${mapId}/${entity.id}/${oldRow.item.id}`);
  }
}
assert.equal(displayedEquipmentRows, manifest.stats.dropRows);
for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), expected);
const report = { kind: "equipment-loot-data-projection-audit", errors: [],
  scope: "Real source-stage data through pure loot selectors; no app/browser/game test or rendered UI certification.",
  stats: { maps: manifest.maps.length, appearances, lootAppearances, displayedEquipmentRows }, hashes };
writeGeneratedFile(path.resolve(root, process.argv[4]), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
