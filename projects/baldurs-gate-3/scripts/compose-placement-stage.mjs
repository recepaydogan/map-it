import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compose completed raw source checkpoints without rebuilding or changing their
// semantics. Later explicit inputs override earlier maps; originals stay intact.
assert(process.argv.length >= 5, "Usage: compose-placement-stage.mjs <fresh-output> <base-stage> [overlay-stage ...] [--source-upgrade-audit report]");
const root = path.resolve(import.meta.dirname, "..");
const arguments_ = process.argv.slice(2);
const upgradeIndex = arguments_.indexOf("--source-upgrade-audit");
let sourceUpgradePath = null;
if (upgradeIndex !== -1) {
  assert.equal(upgradeIndex, arguments_.length - 2, "Source upgrade proof must be the final option");
  sourceUpgradePath = path.resolve(root, arguments_[upgradeIndex + 1]);
  arguments_.splice(upgradeIndex, 2);
}
const [output, ...inputs] = arguments_.map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const inside = (file) => {
  const value = path.relative(boundary, file);
  return value && !value.startsWith("..") && !path.isAbsolute(value);
};
assert(inside(path.join(fs.realpathSync(path.dirname(output)), path.basename(output))) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, owners = new Map(), manifests = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const data = fs.readFileSync(file); hashes[relative(file)] = digest(data); return data;
};
const write = (file, value) => {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeGeneratedFile(target, data); outputHashes[file] = digest(data);
};
const sourceUpgrade = sourceUpgradePath ? JSON.parse(bytes(sourceUpgradePath)) : null;
if (sourceUpgrade) {
  assert.equal(inputs.length, 2, "A source upgrade proof binds exactly one base and one overlay");
  assert.equal(sourceUpgrade.kind, "regional-placement-source-upgrade-audit");
  assert.deepEqual(sourceUpgrade.errors, []);
  assert.equal(sourceUpgrade.baseRoot, inputs[0]); assert.equal(sourceUpgrade.overlayRoot, inputs[1]);
  assert.deepEqual(sourceUpgrade.upgradedFields, ["storyLocationsPath", "sceneContentPath"]);
  assert(Object.keys(sourceUpgrade.hashes ?? {}).length, "Missing source upgrade hashes");
  for (const [file, expected] of Object.entries(sourceUpgrade.hashes)) {
    assert.equal(digest(bytes(path.resolve(root, file))), expected, `Stale source upgrade proof: ${file}`);
  }
}
for (const input of inputs) {
  assert(inside(fs.realpathSync(input)), "Source stage must be under audits");
  const manifest = JSON.parse(bytes(path.join(input, "stage-manifest.json")));
  assert.equal(manifest.kind, "unfinalized-placement-stage");
  assert.equal(new Set(manifest.maps).size, manifest.maps.length);
  for (const key of ["configPath", "storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath", "gameplayStatsPath",
    "previousAnchorContext", "storyDestinationRouting"]) {
    if (manifests.length) {
      if (sourceUpgrade?.upgradedFields.includes(key)) {
        assert.equal(manifests[0][key], sourceUpgrade.contracts[key].before);
        assert.equal(manifest[key], sourceUpgrade.contracts[key].after);
      } else assert.equal(manifest[key], manifests[0][key], `Different source contract: ${key}`);
    }
  }
  for (const mapId of manifest.maps) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapId)); owners.set(mapId, input);
  }
  manifests.push(manifest);
}
const config = JSON.parse(bytes(manifests[0].configPath));
assert.deepEqual([...owners.keys()].sort(), config.maps.map(({ id }) => id).sort(), "Composition must cover exactly the configured maps");
if (sourceUpgrade) {
  assert.deepEqual(sourceUpgrade.overlayMaps, manifests[1].maps);
  assert.deepEqual(sourceUpgrade.reusedMaps, manifests[0].maps.filter((id) => !manifests[1].maps.includes(id)));
  for (const file of Object.keys(hashes)) {
    if (file === relative(sourceUpgradePath)) continue;
    assert.equal(hashes[file], sourceUpgrade.hashes[file], `Composition input not covered by source upgrade proof: ${file}`);
  }
}
let candidates = 0, appearances = 0;
const compactedMaps = [];
for (const { id: mapId } of config.maps) {
  const input = owners.get(mapId);
  const files = [`public/maps/${mapId}/content.json`, `public/maps/${mapId}/locations.json`,
    `map-sources/catalog/${mapId}-placements.json`, `map-sources/catalog/${mapId}-placement-rejections.json`];
  for (const file of files) {
    const data = bytes(path.join(input, file)), document = JSON.parse(data);
    if (sourceUpgrade) assert.equal(digest(data), sourceUpgrade.hashes[relative(path.join(input, file))], `Unaudited source map: ${file}`);
    if (file.endsWith("-placements.json")) {
      candidates += document.candidates.length;
      if (Object.hasOwn(document, "records")) {
        compactedMaps.push({ mapId, records: document.records.length });
        delete document.records;
        document.recordsOmitted = true;
        write(file, document);
      } else { assert.equal(document.recordsOmitted, true); write(file, data); }
    } else {
      if (file.endsWith("content.json")) appearances += document.entities.length;
      write(file, data);
    }
  }
}
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Source changed: ${file}`);
write("composition-report.json", { kind: "raw-placement-checkpoint-composition", inputs, hashes, outputHashes: { ...outputHashes },
  ...(sourceUpgrade ? { sourceUpgradePath, sourceUpgradeStats: sourceUpgrade.stats } : {}),
  maps: [...owners].map(([mapId, sourceStage]) => ({ mapId, sourceStage })), compactedMaps,
  stats: { maps: owners.size, candidates, appearances },
  scope: "Exact source file composition with explicit per-map precedence; full records omitted only from the new copy. Not semantic approval, routing, source completeness or publication." });
write("stage-manifest.json", { ...manifests[sourceUpgrade ? 1 : 0], maps: config.maps.map(({ id }) => id), recordsIncluded: false,
  composedFrom: inputs, compositionReport: "composition-report.json", publishedDataUnchanged: true });
console.log(JSON.stringify({ output, maps: owners.size, candidates, appearances, compactedMaps: compactedMaps.length }, null, 2));
