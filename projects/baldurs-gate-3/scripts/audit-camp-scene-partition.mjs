import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 7, "Usage: audit-camp-scene-partition.mjs <before-stage> <after-stage> <canonical> <source-audit> <fresh-report>");
const [beforeRoot, afterRoot, canonical, sourcePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outRelative && !outRelative.startsWith("..") && !path.isAbsolute(outRelative) && !fs.existsSync(output));
const hashes = {}, errors = [], changes = [], added = [], positions = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Changed audit input: ${key}`); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const source = read(sourcePath), previous = read(path.join(beforeRoot, "stage-manifest.json")), next = read(path.join(afterRoot, "stage-manifest.json"));
assert.equal(source.kind, "camp-resident-native-source-audit"); assert.deepEqual(source.errors, []);
for (const [file, hash] of Object.entries(source.hashes)) assert.equal(digest(bytes(file)), hash, `Stale native resident proof: ${file}`);
assert.equal(previous.storyLocationsPath, source.beforePath); assert.equal(next.storyLocationsPath, source.afterPath);
assert.equal(next.previousStageRoot, canonical); assert.equal(previous.previousStageRoot, canonical);
assert.deepEqual(next.maps, previous.maps);
const acceptedManifest = read(path.join(canonical, "stage-manifest.json")), catalog = read(next.storyLocationsPath);
const previousCatalog = read(previous.storyLocationsPath);
const oldRelationIds = new Set(previousCatalog.scriptedDestinations.map(({ id }) => id));
const reviewedAnchors = new Set(source.reviewedRows.map(({ characterId, anchorId }) => `${characterId}/${anchorId}`));
const addedSourceRelations = catalog.scriptedDestinations.filter(({ id }) => !oldRelationIds.has(id));
assert.equal(addedSourceRelations.length, source.stats.addedRelations);
for (const relation of addedSourceRelations) assert(reviewedAnchors.has(`${relation.character.id}/${relation.anchor.id}`)
  && relation.campResidentContext, `Unaudited new source destination: ${relation.id}`);
const newlyRegistered = new Set(addedSourceRelations.map(({ id }) => id)), representedNewRelations = new Set();
const relations = keyed(catalog.scriptedDestinations), transforms = read("map-sources/catalog/level-transforms.json");
const sourceRoots = ["map-sources/extracted/package-placements", "map-sources/converted/main-level-placements",
  "map-sources/converted/wld-placements", "map-sources/converted/auxiliary-level-placements"];
const objectFiles = new Map();
const objectAt = (file, id) => {
  if (!objectFiles.has(file)) objectFiles.set(file, new Map((read(file).save?.regions?.Templates?.GameObjects ?? [])
    .map((object) => [object.MapKey?.value, object])));
  return objectFiles.get(file).get(id);
};
const nativePosition = (candidate, anchorId) => {
  const matches = [];
  for (const entry of candidate.provenance) {
    if (!entry.sourcePath.endsWith(".lsj")) continue;
    const suffix = entry.sourcePath.replace(/^(supplementary|main|wld)\//, "");
    for (const directory of sourceRoots) {
      const file = path.join(directory, suffix);
      if (!fs.existsSync(file)) continue;
      const object = objectAt(file, anchorId);
      if (!object) continue;
      const values = object.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
      if (!values || values.length !== 3 || values.some((value) => !Number.isFinite(value))) continue;
      matches.push({ file, position: { x: values[0], y: values[1], z: values[2] } });
    }
  }
  assert(matches.length, `No original anchor object: ${anchorId}`);
  const local = candidate.sourcePosition ?? candidate.position;
  const matching = matches.filter(({ position }) => equal(position, local));
  assert(matching.length, `Native local coordinates differ: ${anchorId}`);
  let position = { ...local };
  const nativeInstances = [];
  for (const instance of candidate.templateProjection?.chain ?? []) {
    const registered = transforms.templateTransforms.find(({ id }) => id === instance.id);
    assert(registered, `Unknown template instance: ${instance.id}`);
    for (const key of Object.keys(instance)) assert.deepEqual(instance[key], registered[key]);
    const originals = ["map-sources/extracted/level-templates"].map((directory) => path.join(directory, instance.provenance.sourcePath))
      .filter((file) => fs.existsSync(file)).map((file) => ({ file, object: objectAt(file, registered.mapKey) })).filter(({ object }) => object);
    assert(originals.length, `Missing original template instance: ${instance.id}`);
    const original = originals.find(({ object }) => {
      const native = object.Transform?.[0];
      const vector = (field) => native?.[field]?.value?.split(/\s+/).map(Number);
      return equal(vector("Position"), Object.values(instance.position))
        && equal(vector("RotationQuat"), Object.values(instance.rotation)) && native?.Scale?.value === instance.scale;
    });
    assert(original, `Original template transform differs: ${instance.id}`);
    nativeInstances.push(original.file);
    const { x, y, z, w } = instance.rotation, s = instance.scale;
    const matrix = [[w*w+x*x-y*y-z*z, 2*(x*y-w*z), 2*(x*z+w*y)],
      [2*(x*y+w*z), w*w-x*x+y*y-z*z, 2*(y*z-w*x)], [2*(x*z-w*y), 2*(y*z+w*x), w*w-x*x-y*y+z*z]];
    const input = [position.x*s, position.y*s, position.z*s];
    position = Object.fromEntries(["x", "y", "z"].map((axis, index) =>
      [axis, matrix[index].reduce((sum, value, column) => sum + value*input[column], 0) + instance.position[axis]]));
  }
  const applied = candidate.templateProjection?.mapTransform ?? candidate.positionTransform;
  if (applied) {
    const transform = [...transforms.transforms, ...(transforms.spatialTransforms ?? [])].find(({ id }) => id === applied.id);
    assert(transform && equal(applied.offset, transform.offset) && applied.rotationQuarterTurns === transform.rotationQuarterTurns);
    const angle = transform.rotationQuarterTurns * Math.PI / 2;
    position = { x: Math.round(Math.cos(angle)) * position.x - Math.round(Math.sin(angle)) * position.z + transform.offset.x,
      y: position.y, z: Math.round(Math.sin(angle)) * position.x + Math.round(Math.cos(angle)) * position.z + transform.offset.z };
  }
  assert(["x", "y", "z"].every((axis) => Math.abs(position[axis] - candidate.position[axis]) < 0.000001), `Native world projection differs: ${anchorId}`);
  return { nativeFiles: matching.map(({ file }) => file), nativeInstances, sourcePosition: local,
    positionTransform: candidate.positionTransform, templateProjection: candidate.templateProjection, worldPosition: position };
};
const load = (directory, mapId) => ({
  content: read(path.join(directory, `public/maps/${mapId}/content.json`)),
  markers: read(path.join(directory, `public/maps/${mapId}/locations.json`)),
  candidates: read(path.join(directory, `map-sources/catalog/${mapId}-placements.json`)),
  rejections: read(path.join(directory, `map-sources/catalog/${mapId}-placement-rejections.json`)),
});
const relationIds = (profile) => profile ? [...profile.kinds.map((kind) => `${profile.characterContentId}:${kind}:${profile.anchorContentId}`),
  ...(profile.alternateDestinations ?? []).map((row) => `${profile.characterContentId}:${row.kind}:${row.anchorContentId}`)] : [];
let oldCount = 0, newCount = 0, acceptedCount = 0, entryContexts = 0, residentContexts = 0;
for (const mapId of next.maps) {
  const old = load(beforeRoot, mapId), current = load(afterRoot, mapId);
  const oldEntities = keyed(old.content.entities), entities = keyed(current.content.entities), candidates = keyed(current.candidates.candidates);
  oldCount += oldEntities.size; newCount += entities.size;
  const acceptedFile = `public/maps/${mapId}/content.json`, acceptedBytes = bytes(path.join(canonical, acceptedFile));
  assert.equal(digest(acceptedBytes), acceptedManifest.outputHashes[acceptedFile]);
  for (const entity of JSON.parse(acceptedBytes).entities) {
    check(entities.has(entity.id) && equal(entity.worldPosition, entities.get(entity.id)?.worldPosition), `Accepted appearance lost/moved: ${mapId}/${entity.id}`);
    acceptedCount++;
  }
  const previousReferences = new Set(old.content.entities.flatMap((entity) => relationIds(entity.storyDestination)));
  const metadata = read(path.join(canonical, `public/maps/${mapId}/metadata.json`));
  assert.equal(digest(bytes(path.join(canonical, `public/maps/${mapId}/metadata.json`))), acceptedManifest.outputHashes[`public/maps/${mapId}/metadata.json`]);
  const { data, info } = await sharp(bytes(`public/maps/${mapId}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const markers = keyed(current.markers.locations);
  for (const entity of entities.values()) {
    const profile = entity.storyDestination;
    if (!profile) continue;
    const selected = profile.kinds.map((kind) => relations.get(`${profile.characterContentId}:${kind}:${profile.anchorContentId}`));
    check(selected.every(Boolean), `Unknown selected relation: ${mapId}/${entity.id}`);
    const entry = selected.flatMap((relation) => relation?.campEntryContext ? [relation.campEntryContext] : []);
    const resident = selected.flatMap((relation) => relation?.campResidentContext ? [relation.campResidentContext] : []);
    check(equal(profile.campEntryContexts ?? [], entry) && equal(profile.campResidentContexts ?? [], resident), `Lost/mixed source context: ${mapId}/${entity.id}`);
    entryContexts += entry.length; residentContexts += resident.length;
    for (const relation of selected) if (newlyRegistered.has(relation?.id)) representedNewRelations.add(relation.id);
    if (entry.length || resident.length) check(!profile.otherAnchorContentIds.length && !(profile.alternateDestinations ?? []).length,
      `Conditional scene absorbed another location: ${mapId}/${entity.id}`);
    if (oldEntities.has(entity.id)) continue;
    check(profile.kinds.some((kind) => previousReferences.has(`${profile.characterContentId}:${kind}:${profile.anchorContentId}`)
      || newlyRegistered.has(`${profile.characterContentId}:${kind}:${profile.anchorContentId}`)),
      `New appearance is neither a previously represented anchor nor an independently approved native registration: ${mapId}/${entity.id}`);
    const candidate = candidates.get(entity.id), marker = markers.get(entity.id), proof = nativePosition(candidate, profile.anchorContentId);
    check(equal(candidate.position, entity.worldPosition), `Entity/candidate world mismatch: ${entity.id}`);
    const { worldBounds: world, imageBounds: image, flipY } = metadata.coordinateReference;
    const u = (entity.worldPosition.x - world.x) / world.width, v = (entity.worldPosition.z - world.y) / world.height;
    const projected = { x: image.x + u * image.width, y: image.y + (flipY ? 1 - v : v) * image.height };
    const original = candidate.mapPositionAdjustment?.original ?? marker;
    check(Math.hypot(projected.x - original.x, projected.y - original.y) < 0.002, `Marker projection differs: ${entity.id}`);
    const px = Math.round((marker.x - image.x) / image.width * (info.width - 1)), py = Math.round((marker.y - image.y) / image.height * (info.height - 1));
    check(px >= 0 && py >= 0 && px < info.width && py < info.height && data[(py * info.width + px) * info.channels + 3] > 16,
      `New marker is outside visible native imagery: ${entity.id}`);
    added.push({ mapId, id: entity.id, title: entity.title, selectedAnchor: profile.anchorContentId, entry: !!entry.length, resident: !!resident.length });
    positions.push({ mapId, id: entity.id, ...proof, mapPosition: { x: marker.x, y: marker.y }, adjustment: candidate.mapPositionAdjustment });
  }
  check(equal(old.rejections, current.rejections), `Rejections changed: ${mapId}`);
  for (const [label, oldRows, newRows, allowed] of [
    ["entity", old.content.entities, current.content.entities, ["storyDestination", "provenance"]],
    ["marker", old.markers.locations, current.markers.locations, []],
    ["candidate", old.candidates.candidates, current.candidates.candidates, ["storyDestination", "provenance"]],
  ]) {
    const before = keyed(oldRows), after = keyed(newRows);
    assert.deepEqual([...after.keys()].sort(), [...entities.keys()].sort());
    for (const [id, row] of before) {
      check(after.has(id), `Previous ${label} lost: ${mapId}/${id}`);
      if (!after.has(id)) continue;
      const fields = [...new Set([...Object.keys(row), ...Object.keys(after.get(id))])].filter((field) => !equal(row[field], after.get(id)[field]));
      if (fields.length) changes.push({ mapId, id, label, fields });
      check(fields.every((field) => allowed.includes(field)), `Unreviewed ${label} change: ${mapId}/${id}/${fields.join(",")}`);
      if (fields.includes("provenance")) check(row.provenance.every((entry) => after.get(id).provenance.some((next) => equal(entry, next))),
        `Original provenance lost: ${mapId}/${id}`);
    }
  }
  const oldLinks = new Set((old.content.relationships ?? []).map((row) => JSON.stringify(row)));
  const newLinks = new Set((current.content.relationships ?? []).map((row) => JSON.stringify(row)));
  check([...oldLinks].every((row) => newLinks.has(row)), `Existing relationships lost: ${mapId}`);
}
const oldProfiles = read(previous.sceneContentPath).profiles, newProfiles = read(next.sceneContentPath).profiles;
assert.deepEqual([...representedNewRelations].sort(), [...newlyRegistered].sort(), "New native registrations are not fully represented");
check(equal(oldProfiles, newProfiles), "Unrelated scene-content profiles changed");
bytes(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: next.maps.length, beforeAppearances: oldCount, afterAppearances: newCount,
  addedPreviouslyAlternateAnchors: added.filter((entry) => !addedSourceRelations.some((relation) => relation.anchor.id === entry.selectedAnchor)).length,
  addedNewlyRegisteredAnchors: representedNewRelations.size,
  acceptedAppearancesPreserved: acceptedCount, selectedCampEntryContexts: entryContexts, selectedCampResidentContexts: residentContexts,
  changedRecords: changes.length, originalSceneProfilesPreserved: oldProfiles.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-scene-partition-audit", beforeRoot, afterRoot, canonical, sourcePath, stats,
  added, positions, changes, hashes, errors,
  scope: "Actual regional generation, preserved existing identities/coordinates/content, separate source contexts, native coordinates and visible imagery for recovered anchors. Roles, inventory and conditional presentation remain unapproved." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
