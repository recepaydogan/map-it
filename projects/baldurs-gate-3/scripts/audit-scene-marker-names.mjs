import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare real generator output independently of the scene applicator. A
// correct content title alone does not establish correct pin/index naming.
assert.equal(process.argv.length, 5,
  "Usage: audit-scene-marker-names.mjs <before-full-stage> <after-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [beforeRoot, afterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, errors = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data), `Input changed: ${key}`);
  hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const check = (value, message) => { if (!value) errors.push(message); };
const keyed = (rows) => {
  const result = new Map(rows.map((row) => [row.id, row]));
  assert.equal(result.size, rows.length, "Duplicate record identity"); return result;
};
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
for (const key of ["kind", "configPath", "storyLocationsPath", "sceneContentPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath",
  "previousAnchorContext", "previousStageRoot", "previousContentHashes", "recordsIncluded", "storyDestinationRouting"]) {
  assert.deepEqual(before[key], after[key], `Source contract changed: ${key}`);
}
assert.equal(before.kind, "unfinalized-placement-stage");
assert.equal(new Set(before.maps).size, before.maps.length);
assert.equal(new Set(after.maps).size, after.maps.length);
assert(after.maps.every((id) => before.maps.includes(id)));
const config = read(before.configPath);
assert.deepEqual([...before.maps].sort(), config.maps.map(({ id }) => id).sort());
const catalog = read(after.sceneContentPath);
for (const [file, hash] of Object.entries(catalog.hashes)) assert.equal(digest(bytes(file)), hash, `Stale reviewed scene source: ${file}`);
const namedProfiles = catalog.profiles.filter((profile) => profile.localizedTitles), applied = new Set();
const matches = [], generationTimestamps = [];
let appearances = 0, identical = 0;
for (const mapId of before.maps) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapId));
  const refreshed = after.maps.includes(mapId), oldDocuments = {}, nextDocuments = {};
  for (const [key, file] of Object.entries({ content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
    placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` })) {
    oldDocuments[key] = read(path.join(beforeRoot, file));
    nextDocuments[key] = refreshed ? read(path.join(afterRoot, file)) : oldDocuments[key];
  }
  for (const [key, rows] of [["content", "entities"], ["locations", "locations"], ["placement", "candidates"]]) {
    const ignored = [rows];
    if (key === "placement" && oldDocuments[key].generatedAt !== nextDocuments[key].generatedAt) {
      const previous = oldDocuments[key].generatedAt, next = nextDocuments[key].generatedAt;
      assert(refreshed && new Date(previous).toISOString() === previous && new Date(next).toISOString() === next
        && Date.parse(next) >= Date.parse(previous));
      ignored.push("generatedAt"); generationTimestamps.push({ mapId, before: previous, after: next });
    }
    check(equal(omit(oldDocuments[key], ignored), omit(nextDocuments[key], ignored)), `Document envelope changed: ${mapId}/${key}`);
    assert.deepEqual(oldDocuments[key][rows].map(({ id }) => id), nextDocuments[key][rows].map(({ id }) => id));
  }
  check(equal(oldDocuments.rejections, nextDocuments.rejections), `Rejections changed: ${mapId}`);
  // Content includes relationships, all item routes, conditions, combat and
  // scene provenance. None may change in this marker-field correction.
  check(equal(oldDocuments.content, nextDocuments.content), `Content changed: ${mapId}`);
  check(equal(oldDocuments.placement.candidates, nextDocuments.placement.candidates), `Candidates changed: ${mapId}`);
  const oldMarkers = keyed(oldDocuments.locations.locations), nextMarkers = keyed(nextDocuments.locations.locations);
  for (const entity of oldDocuments.content.entities) {
    const old = oldMarkers.get(entity.id), next = nextMarkers.get(entity.id);
    assert(old && next); appearances++;
    const profile = namedProfiles.find((row) => row.characterContentId === entity.storyDestination?.characterContentId
      && row.anchorContentId === entity.storyDestination?.anchorContentId);
    if (!profile) { check(equal(old, next), `Unrelated marker changed: ${mapId}/${entity.id}`); identical++; continue; }
    assert(refreshed, `Named scene not regenerated: ${mapId}/${entity.id}`);
    applied.add(profile.id);
    assert.equal(entity.sceneContext.id, profile.id);
    assert.equal(entity.title, profile.localizedTitles.en);
    assert.deepEqual(entity.localizedTitles, profile.localizedTitles);
    assert.equal(old.title, entity.title);
    assert.deepEqual(old.localizedTitles, entity.localizedTitles);
    assert.notEqual(old.name, entity.title, "Expected a real stale-name record");
    const inventoryItems = (profile.inventoryChange?.branches ?? []).filter((row) => !row.reviewOnly).flatMap((row) => row.items);
    const equipmentItems = profile.equipmentChange?.items ?? [];
    const suffix = [...Object.values(profile.localizedTitles), ...[...inventoryItems, ...equipmentItems]
      .flatMap((item) => [...Object.values(item.localizedNames), item.statsId])];
    const prefixLength = old.searchTerms.length - suffix.length;
    assert(prefixLength >= 0); assert.deepEqual(old.searchTerms.slice(prefixLength), suffix);
    const expected = { ...omit(old, ["title", "localizedTitles"]), name: entity.title,
      searchTerms: [...old.searchTerms.slice(0, prefixLength), old.name, ...suffix] };
    check(equal(next, expected), `Unexpected marker correction: ${mapId}/${entity.id}`);
    check(next.name === entity.title && next.searchTerms.includes(old.name), `Lost presentation or alias: ${mapId}/${entity.id}`);
    matches.push({ mapId, id: entity.id, profileId: profile.id, beforeName: old.name, afterName: next.name });
  }
}
assert.deepEqual([...applied].sort(), namedProfiles.map(({ id }) => id).sort(), "Uncovered named scene profiles");
for (const file of [import.meta.filename, "scripts/lib/scene-content-profile.mjs", "scripts/build-placement-catalog.mjs",
  "scripts/build-registered-placement-maps.mjs", "scripts/build-map-search-index.mjs", "src/features/map/use-map-data.ts",
  "src/features/map/map-location-details.tsx"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const stats = { maps: before.maps.length, refreshedMaps: after.maps.length, appearances, identicalCompleteAppearances: identical,
  correctedMarkerNames: matches.length, reviewedNamedProfiles: applied.size, unchangedSceneProfiles: catalog.profiles.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "scene-marker-name-field-audit", beforeRoot, afterRoot, stats, matches,
  generationTimestamps, hashes, errors, scope: "Actual full raw record comparison against unchanged reviewed scene names. Marker names and original-name search aliases corrected; no entity, candidate, inventory, relationship, ID or position changes. Index/item consumers and source completeness require their own checks; not live publication." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
