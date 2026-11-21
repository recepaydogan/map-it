import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length < 6) throw new Error("Usage: audit-scene-generator-parity.mjs <audited-scene-stage> <raw-baseline> <output-report> <generator-stage> [...stages]");
const [sceneStage, rawBaseline, output, ...stages] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, entries = [], uniqueMaps = new Set(), uniqueAppearances = new Set(), reviewedScenes = new Set();
const read = (file) => {
  const bytes = fs.readFileSync(file);
  const key = path.relative(root, file).split(path.sep).join("/"), digest = createHash("sha256").update(bytes).digest("hex");
  assert(!hashes[key] || hashes[key] === digest, `Input changed ${key}`);
  hashes[key] = digest;
  return JSON.parse(bytes.toString("utf8"));
};
const sceneManifest = read(path.join(sceneStage, "stage-manifest.json"));
const targetKeys = new Set(sceneManifest.matches.map(({ mapId, contentId }) => `${mapId}/${contentId}`));
const omit = (value, key) => Object.fromEntries(Object.entries(value).filter(([field]) => field !== key));
for (const stage of stages) {
  const manifest = read(path.join(stage, "stage-manifest.json"));
  assert.equal(manifest.kind, "unfinalized-placement-stage");
  assert.equal(manifest.sceneContentPath, sceneManifest.catalogPath);
  for (const mapId of manifest.maps) {
    uniqueMaps.add(mapId);
    for (const [filename, field] of [["content.json", "entities"], ["locations.json", "locations"]]) {
      const before = read(path.join(rawBaseline, "public/maps", mapId, filename));
      const generated = read(path.join(stage, "public/maps", mapId, filename));
      const audited = read(path.join(sceneStage, "public/maps", mapId, filename));
      assert.deepEqual(omit(generated, field), omit(before, field), `Unrelated map fields changed ${mapId}/${filename}`);
      const oldRows = Object.values(before[field]), rows = Object.values(generated[field]);
      assert.deepEqual(rows.map(({ id }) => id), oldRows.map(({ id }) => id), `Generator lost/added pins ${mapId}`);
      const expectedTargets = new Map(Object.values(audited[field]).map((entry) => [entry.id, entry]));
      for (let index = 0; index < oldRows.length; index++) {
        const key = `${mapId}/${oldRows[index].id}`;
        uniqueAppearances.add(key);
        if (targetKeys.has(key)) {
          assert.deepEqual(rows[index], expectedTargets.get(oldRows[index].id), `Generator differs from audited scene ${key}/${filename}`);
          reviewedScenes.add(key);
        } else assert.deepEqual(rows[index], oldRows[index], `Unrelated generated record changed ${key}/${filename}`);
      }
      entries.push({ stage, mapId, filename, appearances: rows.length });
    }
  }
}
assert.deepEqual([...reviewedScenes].sort(), [...targetKeys].sort(), "Not every reviewed scene was regenerated");
for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), expected);
const report = { kind: "scene-generator-parity-audit", errors: [],
  scope: "Normal registered generation of every reviewed scene and dependent floors, compared with the original full raw stage and the independently audited scene outputs.",
  stats: { generatorStages: stages.length, maps: uniqueMaps.size, appearances: uniqueAppearances.size, reviewedScenes: reviewedScenes.size }, entries, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
