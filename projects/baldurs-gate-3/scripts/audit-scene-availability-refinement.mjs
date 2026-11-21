import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { readStorySourceLines, normalizeStoryCode } from "./lib/story-source-lines.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent of the refinement builder, scene applicator and item producer.
// Derive every permitted delta, then compare complete actual documents.
assert.equal(process.argv.length, 7,
  "Usage: audit-scene-availability-refinement.mjs <stage> <items> <old-index> <index> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, itemsPath, oldIndexPath, indexPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
const canonical = (row) => JSON.stringify(row, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))) : value);
const verifyHashes = (values) => {
  assert(Object.keys(values).length);
  for (const [file, hash] of Object.entries(values)) assert.equal(digest(bytes(file)), hash, `Stale source: ${file}`);
};
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "canonical-scene-availability-review-stage"); verifyHashes(manifest.hashes);
const sourceProof = read(manifest.sourceAuditPath); assert.deepEqual(sourceProof.errors, []); verifyHashes(sourceProof.hashes);
assert.equal(sourceProof.stage, manifest.baselineStage);
const baseManifest = read(path.join(manifest.baselineStage, "stage-manifest.json"));
const before = read(baseManifest.sceneContentPath), after = read(manifest.sceneContentPath);
verifyHashes(after.hashes);
const recipe = read(after.inputs.recipe);
assert.equal(path.resolve(root, after.inputs.baseCatalog), path.resolve(baseManifest.sceneContentPath));
assert.deepEqual(manifest.maps, baseManifest.maps);
assert.deepEqual(manifest.maps.slice().sort(), read(manifest.configPath).maps.map((map) => map.id).sort());
const rules = [], sourceEvidence = [];
const normalize = (line) => normalizeStoryCode(line.trim().replace(/;$/, ""));
for (const review of recipe.reviews) {
  const lines = readStorySourceLines(bytes(review.sourcePath).toString("utf8")).lines;
  const actionIndex = review.actionLine - 1;
  let first = actionIndex, last = actionIndex + 1;
  while (first >= 0 && !["IF", "IFF", "PROC", "QRY"].includes(lines[first].trim())) first--;
  while (last < lines.length && !["IF", "IFF", "PROC", "QRY"].includes(lines[last].trim())) last++;
  assert(first >= 0);
  const then = lines.findIndex((line, index) => index > first && index < last && line.trim() === "THEN");
  assert(then > first && then < actionIndex);
  const statements = lines.slice(first + 1, last).map((line, index) => ({ sourcePath: review.sourcePath,
    sourceLine: first + index + 2, statement: normalize(line) }))
    .filter((row) => row.statement && !["AND", "THEN"].includes(row.statement));
  // These reviewed lifecycle rules consist of complete single-line calls.
  // Fail rather than misparse a future multiline or alternative rule shape.
  assert(statements.every((row) => /^(?:NOT )?[A-Za-z_]\w*\(.*\)$/.test(row.statement)));
  const guards = statements.filter((row) => row.sourceLine < then + 1).map((row) => row.statement);
  const actions = statements.filter((row) => row.sourceLine > then + 1).map((row) => row.statement);
  assert.deepEqual(guards, review.requiredGuards.map(normalize));
  assert.deepEqual(actions, review.requiredActions.map(normalize));
  assert(statements.some((row) => row.sourceLine === review.actionLine));
  sourceEvidence.push(...statements); rules.push({ id: review.id, guards, actions, evidence: statements });
}
const death = rules.find((rule) => rule.id === recipe.deathReview); assert(death);
assert.equal(death.guards.length, 2);
assert(death.guards[0].startsWith("Died(") && death.guards[0].includes(recipe.characterContentId));
assert(death.guards[1].startsWith("NOT DB_GlobalFlag(") && death.guards[1].includes(recipe.exceptionFlagId));
assert(death.actions.some((action) => action.startsWith("SetOnStage(") && action.includes(recipe.characterContentId) && /,\s*0\)$/.test(action)));
const selected = new Set(recipe.groups.flatMap((group) => group.contexts.map((context) => `${group.prefix}${context}`)));
assert.equal(selected.size, recipe.groups.reduce((sum, group) => sum + group.contexts.length, 0));
assert.deepEqual([...selected].sort(), [...after.enrichedProfileIds].sort());
const profiles = new Map(after.profiles.map((profile) => [profile.id, profile])), oldProfiles = new Map(before.profiles.map((profile) => [profile.id, profile]));
assert.deepEqual([...profiles.keys()], [...oldProfiles.keys()]);
for (const old of before.profiles) {
  const current = profiles.get(old.id);
  if (!selected.has(old.id)) { assert.deepEqual(current, old); continue; }
  assert.equal(old.characterContentId, recipe.characterContentId); assert(!old.deathDropsUnavailable);
  const expected = structuredClone(old); expected.deathDropsUnavailable = true;
  for (const [field, suffix] of [["localizedDescriptions", recipe.descriptionAppendix], ["lootAvailability", recipe.availabilityAppendix]]) {
    for (const language of Object.keys(expected[field])) expected[field][language] += ` ${suffix[language]}`;
  }
  expected.evidence = [...new Map([...old.evidence, ...sourceEvidence].map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()];
  assert.deepEqual(current, expected, `Unexpected profile mutation: ${old.id}`);
}
const changes = [], targets = new Map(); let identicalEntities = 0, appearances = 0;
const identities = new Set();
for (const mapId of manifest.maps) {
  const contentFile = `public/maps/${mapId}/content.json`, candidatesFile = `map-sources/catalog/${mapId}-placements.json`;
  const previous = read(path.join(manifest.baselineStage, contentFile)), current = read(path.join(stage, contentFile));
  assert.deepEqual(omit(current, ["entities"]), omit(previous, ["entities"]));
  assert.deepEqual(current.entities.map((entity) => entity.id), previous.entities.map((entity) => entity.id));
  for (const [index, old] of previous.entities.entries()) {
    appearances++; identities.add(old.id);
    const actual = current.entities[index], profileId = old.sceneContext?.id;
    if (!selected.has(profileId)) { assert.deepEqual(actual, old); identicalEntities++; continue; }
    const profile = profiles.get(profileId), expected = structuredClone(old);
    assert.equal(old.storyDestination.characterContentId, recipe.characterContentId);
    assert.equal(old.storyDestination.anchorContentId, profile.anchorContentId);
    expected.sceneContext.localizedDescriptions = profile.localizedDescriptions;
    expected.sceneContext.evidence = profile.evidence;
    expected.deathLoot.availability = { id: profileId, localizedConditions: profile.lootAvailability,
      evidence: profile.evidence, deathDropsUnavailable: true };
    assert.deepEqual(actual, expected, `Unexpected entity mutation: ${mapId}/${old.id}`);
    const key = `${mapId}/${old.id}`; assert(!targets.has(key)); targets.set(key, profile);
    changes.push({ mapId, id: old.id, profileId });
  }
  const oldCandidates = read(path.join(manifest.baselineStage, candidatesFile)), candidates = read(path.join(stage, candidatesFile));
  const expected = structuredClone(oldCandidates);
  for (const candidate of expected.candidates) if (selected.has(candidate.sceneContent?.id)) {
    assert.deepEqual(candidate.sceneContent, oldProfiles.get(candidate.sceneContent.id));
    candidate.sceneContent = profiles.get(candidate.sceneContent.id);
  }
  assert.deepEqual(candidates, expected, `Unexpected candidate mutation: ${mapId}`);
  for (const file of [contentFile, candidatesFile, `public/maps/${mapId}/locations.json`, `public/maps/${mapId}/metadata.json`,
    `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    const previousBytes = bytes(path.join(manifest.baselineStage, file)), currentBytes = bytes(path.join(stage, file));
    assert.equal(digest(previousBytes), baseManifest.outputHashes[file]); assert.equal(digest(currentBytes), manifest.outputHashes[file]);
    if (![contentFile, candidatesFile].includes(file)) assert(previousBytes.equals(currentBytes), `Geometry/pin/rejection changed: ${file}`);
  }
}
assert.equal(Object.keys(manifest.outputHashes).length, manifest.maps.length * 5);
assert.deepEqual(changes, manifest.changes);
assert.deepEqual(changes.map((row) => row.profileId).sort(), [...selected].sort());
assert.deepEqual(manifest.stats, { maps: manifest.maps.length, appearances, identities: identities.size, refinedAppearances: targets.size });
const consumer = read(sourceProof.reviewPath), oldItems = read(consumer.itemsPath), items = read(itemsPath);
assert.deepEqual(omit(items, ["items", "generatedAt", "stats"]), omit(oldItems, ["items", "generatedAt", "stats"]));
assert.deepEqual(omit(items.stats, ["acquisitionRecords"]), omit(oldItems.stats, ["acquisitionRecords"]));
assert.deepEqual(items.items.map((item) => item.id), oldItems.items.map((item) => item.id));
const removed = [], conditioned = []; let preserved = 0;
for (const [index, old] of oldItems.items.entries()) {
  const item = items.items[index]; assert.deepEqual(omit(item, ["acquisitions"]), omit(old, ["acquisitions"]));
  const expected = [];
  for (const acquisition of old.acquisitions) {
    const key = `${acquisition.mapId}/${acquisition.locationId}`, profile = targets.get(key);
    if (profile && acquisition.kind === "drop") {
      assert.equal(acquisition.sourceId, recipe.characterContentId);
      removed.push({ itemId: item.id, acquisition }); continue;
    }
    const row = omit(acquisition, ["id"]);
    if (profile && ["pickpocket", "random-loot"].includes(acquisition.kind)) {
      Object.assign(row, { certainty: "story", detail: profile.lootAvailability.en, localizedDetails: profile.lootAvailability,
        locationDetail: profile.lootAvailability.en, localizedLocationDetails: profile.lootAvailability });
      conditioned.push({ itemId: item.id, before: acquisition, after: row });
    } else preserved++;
    expected.push(row);
  }
  assert.deepEqual(item.acquisitions.map((row) => canonical(omit(row, ["id"]))).sort(), expected.map(canonical).sort(), `Acquisition conservation failure: ${item.id}`);
}
assert.equal(items.stats.acquisitionRecords, items.items.reduce((sum, item) => sum + item.acquisitions.length, 0));
assert.equal(items.stats.acquisitionRecords, oldItems.stats.acquisitionRecords - removed.length);
assert.deepEqual(removed.map((row) => `${row.acquisition.mapId}/${row.acquisition.locationId}`).sort(), [...targets.keys()].sort());
assert.deepEqual(conditioned.map((row) => `${row.before.mapId}/${row.before.locationId}`).sort(), [...targets.keys()].sort());
assert(conditioned.every((row) => row.before.kind === "pickpocket"));
assert.equal(path.resolve(consumer.indexPath), oldIndexPath);
const oldIndex = read(oldIndexPath), index = read(indexPath); assert.deepEqual(index, oldIndex);
assert.equal(index.locations.length, appearances);
const markerProof = read(consumer.markerAuditPath); assert.equal(markerProof.placementStageRoot, manifest.baselineStage);
assert.equal(markerProof.stats.auditedMaps, manifest.maps.length);
for (const field of ["transparentPublishedMarkers", "distantPublishedMarkers", "actionableRejectedCandidates", "routingViolations", "unreviewedAdjustments"]) assert.equal(markerProof.stats[field], 0);
for (const file of [import.meta.filename, "scripts/lib/story-source-lines.mjs", "scripts/build-item-database.mjs", "scripts/build-map-search-index.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const result = { kind: "independent-scene-availability-refinement-audit", stage, itemsPath, indexPath,
  sourceAuditPath: manifest.sourceAuditPath, stats: { maps: manifest.maps.length, appearances, identities: identities.size,
    refinedAppearances: changes.length, identicalEntities, preservedItems: items.items.length,
    previousAcquisitions: oldItems.stats.acquisitionRecords, acquisitions: items.stats.acquisitionRecords,
    unchangedAcquisitions: preserved, removedCampDeathRoutes: removed.length, retainedConditionedPickpocketRoutes: conditioned.length,
    unchangedNativeConnections: index.connections.length }, changes, rules, removed, conditioned, hashes, errors: [],
  scope: "Exact source-only refinement of reviewed normal camp contexts. Every pin, position, original inventory, item fact, unrelated acquisition, full index and connection is preserved. Source rule retains its explicit permanent-death exception; this is not global actor immunity. Baseline silhouette proof transfers through byte-identical geometry, not a newly executed visual check. Not full native scene coverage, runtime item-grant completeness, publication or full-goal acceptance." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: result.stats, hashes: Object.keys(hashes).length, errors: [] }));
