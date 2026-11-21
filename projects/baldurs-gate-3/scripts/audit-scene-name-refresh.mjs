import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent native-rule/name and complete-record comparison. Do not import
// the name producer, scene applicator or its statement/rule parsing helpers.
assert.equal(process.argv.length, 5, "Usage: audit-scene-name-refresh.mjs <before-stage> <after-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [beforeRoot, afterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, errors = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = relative(absolute);
  assert(!hashes[key] || hashes[key] === digest(data), `Input changed: ${key}`);
  hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (value, message) => { if (!value) errors.push(message); };
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
for (const key of ["kind", "configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath",
  "previousAnchorContext", "previousStageRoot", "previousContentHashes", "recordsIncluded", "storyDestinationRouting"]) assert.deepEqual(before[key], after[key]);
assert.equal(after.kind, "unfinalized-placement-stage");
assert(after.maps.every((id) => before.maps.includes(id)));
const oldCatalog = read(before.sceneContentPath), catalog = read(after.sceneContentPath);
for (const [file, hash] of Object.entries(catalog.hashes)) assert.equal(digest(bytes(file)), hash, `Stale scene evidence: ${file}`);
const oldProfiles = keyed(oldCatalog.profiles), profiles = keyed(catalog.profiles);
for (const [id, profile] of oldProfiles) check(equal(profile, profiles.get(id)), `Old scene changed: ${id}`);
const additions = catalog.profiles.filter(({ id }) => !oldProfiles.has(id)), recipe = read(catalog.inputs.recipe);
assert.equal(additions.length, recipe.profiles.length);
assert(additions.length && recipe.profiles.every((profile) => profile.storyDisplayName && !profile.kind && !profile.inventoryChange && !profile.equipmentChange));
const normal = (line) => line.replace(/\s*\/\/.*$/, "").trim().replace(/;$/, "").replace(/\s+/g, " ");
const native = new Map();
const linesFor = (file) => {
  if (!native.has(file)) native.set(file, bytes(file).toString("utf8").split(/\r?\n/));
  return native.get(file);
};
const rule = (file, line) => {
  const lines = linesFor(file);
  let start = line - 1;
  while (start >= 0 && !["IF", "PROC", "QRY"].includes(lines[start].trim())) start--;
  assert(start >= 0);
  let end = start + 1;
  while (end < lines.length && !["IF", "PROC", "QRY", "EXITSECTION"].includes(lines[end].trim())) end++;
  const then = lines.findIndex((value, index) => index > start && index < end && value.trim() === "THEN");
  assert(then > start && line - 1 > then && line - 1 < end);
  const evidence = lines.slice(start + 1, end).flatMap((value, index) => {
    const statement = normal(value), sourceLine = start + index + 2;
    return !statement || ["AND", "THEN"].includes(statement) ? [] : [{ sourcePath: file, sourceLine, statement }];
  });
  const guards = evidence.filter(({ sourceLine }) => sourceLine - 1 < then).map(({ statement }) => statement);
  assert(!guards.some((guard) => /DEBUG|Debug_/.test(guard)));
  return { guards, actions: evidence.filter(({ sourceLine }) => sourceLine - 1 > then).map(({ statement }) => statement), evidence };
};
const reviewed = new Map();
for (const review of recipe.reviews) {
  const block = rule(review.sourcePath, review.actionLine);
  assert.deepEqual(block.guards, review.requiredGuards.map(normal));
  assert(review.requiredActions.length && review.requiredActions.every((action) => block.actions.includes(normal(action))));
  assert(!reviewed.has(review.id)); reviewed.set(review.id, block);
}
const guid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
for (const input of recipe.profiles) {
  const profile = profiles.get(input.id), change = input.storyDisplayName;
  assert(profile && input.destinationBinding);
  const nativeLines = linesFor(input.destinationSource);
  const rowLines = []; let index = input.destinationBinding.sourceLine - 1;
  while (index < nativeLines.length) { const line = normal(nativeLines[index]); rowLines.push(line); if (nativeLines[index++].trim().endsWith(";")) break; }
  const statement = normal(rowLines.join(" "));
  assert.equal(statement, normal(input.destinationBinding.statement));
  assert.deepEqual(statement.match(guid), [input.characterContentId, input.anchorContentId, "00000000-0000-0000-0000-000000000000"]);
  const movement = normal(nativeLines[input.destinationLine - 1]);
  assert(movement.startsWith("TeleportTo(") && movement.match(guid)?.[0] === input.characterContentId);
  const placement = rule(input.destinationSource, input.destinationLine);
  const variable = movement.match(/,\s*(_\w+)\)$/)?.[1];
  assert(variable && placement.guards.some((guard) => guard.startsWith(statement.slice(0, statement.indexOf("(")) + "(")
    && guard.match(guid)?.[0] === input.characterContentId && guard.includes(`, ${variable}, _)`)));
  for (const id of change.reviews) {
    assert(input.reviews.includes(id));
    assert(reviewed.get(id).actions.some((action) => action.startsWith("SetStoryDisplayName(")
      && action.match(guid)?.[0] === input.characterContentId && action.endsWith(`, "${change.key}")`)));
  }
  const aliases = read(change.sourcePath).save.regions.TranslatedStringKeys.TranslatedStringKey.filter((row) => row.UUID.value === change.key);
  assert.equal(aliases.length, 1);
  const handle = aliases[0].Content.handle, titles = {};
  for (const [language, file] of Object.entries(change.localization)) {
    const entries = [...bytes(file).toString("utf8").matchAll(/<content contentuid="([^"]+)"[^>]*>([^<]+)<\/content>/g)].filter((row) => row[1] === handle);
    assert.equal(entries.length, 1); assert(!entries[0][2].includes("&"), "Encoded name requires separate decoding review");
    titles[language] = entries[0][2];
  }
  const evidence = [{ sourcePath: input.destinationSource, sourceLine: input.destinationBinding.sourceLine, statement },
    ...placement.evidence, ...input.reviews.flatMap((id) => reviewed.get(id).evidence)];
  assert.deepEqual(profile, { id: input.id, characterContentId: input.characterContentId, anchorContentId: input.anchorContentId,
    localizedDescriptions: input.localizedDescriptions, lootAvailability: input.lootAvailability, localizedTitles: titles,
    evidence: [...new Map(evidence.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] });
}
const matches = [], otherAppearances = [], generationTimestamps = [];
let appearances = 0, identical = 0;
for (const mapId of before.maps) {
  const current = after.maps.includes(mapId), oldDocuments = {}, nextDocuments = {};
  for (const [key, file] of Object.entries({ content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
    placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` })) {
    oldDocuments[key] = read(path.join(beforeRoot, file));
    nextDocuments[key] = current ? read(path.join(afterRoot, file)) : oldDocuments[key];
  }
  for (const [field, rowsKey] of [["content", "entities"], ["locations", "locations"], ["placement", "candidates"]]) {
    const ignored = [rowsKey];
    if (field === "placement" && oldDocuments[field].generatedAt !== nextDocuments[field].generatedAt) {
      const previous = oldDocuments[field].generatedAt, next = nextDocuments[field].generatedAt;
      assert(current && new Date(previous).toISOString() === previous && new Date(next).toISOString() === next
        && Date.parse(next) >= Date.parse(previous), `Invalid generation timestamp: ${mapId}`);
      ignored.push("generatedAt"); generationTimestamps.push({ mapId, before: previous, after: next });
    }
    check(equal(omit(oldDocuments[field], ignored), omit(nextDocuments[field], ignored)), `Unrelated document metadata changed: ${mapId}/${field}`);
    assert.deepEqual(oldDocuments[field][rowsKey].map(({ id }) => id), nextDocuments[field][rowsKey].map(({ id }) => id));
  }
  check(equal(oldDocuments.rejections, nextDocuments.rejections), `Rejections changed: ${mapId}`);
  const indexes = Object.fromEntries(["content", "locations", "placement"].map((field, index) =>
    [field, keyed(nextDocuments[field][["entities", "locations", "candidates"][index]])]));
  for (const entity of oldDocuments.content.entities) {
    const marker = oldDocuments.locations.locations.find(({ id }) => id === entity.id), candidate = oldDocuments.placement.candidates.find(({ id }) => id === entity.id);
    assert(marker && candidate); appearances++;
    const profile = additions.find((row) => row.characterContentId === entity.storyDestination?.characterContentId && row.anchorContentId === entity.storyDestination?.anchorContentId);
    if (!profile) {
      check(equal(entity, indexes.content.get(entity.id)) && equal(marker, indexes.locations.get(entity.id)) && equal(candidate, indexes.placement.get(entity.id)), `Unrelated complete triple changed: ${mapId}/${entity.id}`);
      identical++;
      if (additions.some((row) => entity.id.startsWith(row.characterContentId))) otherAppearances.push({ mapId, id: entity.id, title: entity.title });
      continue;
    }
    assert(current && !entity.sceneContext, "Name refresh needs one newly reviewed scene");
    const expectedEntity = { ...entity, title: profile.localizedTitles.en, localizedTitles: profile.localizedTitles,
      sceneContext: { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence,
        authoredTitles: entity.localizedTitles ?? { en: entity.title } },
      ...(entity.deathLoot ? { deathLoot: { ...entity.deathLoot, availability: { id: profile.id,
        localizedConditions: profile.lootAvailability, evidence: profile.evidence } } } : {}) };
    check(equal(expectedEntity, indexes.content.get(entity.id)), `Unexpected scene entity change: ${entity.id}`);
    check(equal({ ...marker, name: profile.localizedTitles.en,
      searchTerms: [...(marker.searchTerms ?? []), marker.name, ...Object.values(profile.localizedTitles)] }, indexes.locations.get(entity.id)), `Unexpected scene marker change: ${entity.id}`);
    check(equal({ ...candidate, sceneContent: profile, reviewedPresentation: {} }, indexes.placement.get(entity.id)), `Unexpected scene candidate change: ${entity.id}`);
    matches.push({ mapId, id: entity.id, profileId: profile.id, beforeTitle: entity.title, afterTitle: profile.localizedTitles.en });
  }
}
assert.equal(matches.length, additions.length);
bytes(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash, `Changed audit input: ${file}`);
const stats = { maps: before.maps.length, refreshedMaps: after.maps.length, appearances, identicalCompleteAppearances: identical,
  correctedScenes: matches.length, unchangedPriorSceneProfiles: oldProfiles.size, otherActorAppearancesPreserved: otherAppearances.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "reviewed-scene-name-stage-audit", beforeRoot, afterRoot, stats, matches,
  otherAppearances, generationTimestamps, hashes, errors, scope: "Native scene-specific display-name/condition proof and full raw identity/record conservation. Other retained disguises/names are not approved by conservation alone; item/index integration and full encounter-state coverage remain separate." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
