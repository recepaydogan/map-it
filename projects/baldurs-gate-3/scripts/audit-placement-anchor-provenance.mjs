import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent matrix reconstruction of changed coordinate provenance. This
// does not import the placement, anchor-copy or coordinate-transform helpers.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 5) throw new Error("Usage: audit-placement-anchor-provenance.mjs <old-raw-stage> <new-raw-stage> <report>");
const [beforeRoot, afterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, entries = [], additions = [], losses = [], positionChanges = [];
const read = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  const hash = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`);
  hashes[key] = hash;
  return JSON.parse(value.toString("utf8"));
};
const beforeManifest = read(path.join(beforeRoot, "stage-manifest.json")), manifest = read(path.join(afterRoot, "stage-manifest.json"));
assert.equal(manifest.kind, "unfinalized-placement-stage");
const config = read(manifest.configPath), transforms = read(config.levelTransforms);
assert.deepEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort());
assert.deepEqual([...beforeManifest.maps].sort(), [...manifest.maps].sort());
const objects = new Map();
const nativeObjects = (relative) => {
  const matches = [];
  for (const directory of ["map-sources/extracted/package-placements", "map-sources/converted/main-level-placements",
    "map-sources/converted/wld-placements", "map-sources/converted/auxiliary-level-placements", "map-sources/extracted/level-templates"]) {
    const file = path.join(directory, relative.replace(/^supplementary\//, ""));
    if (!fs.existsSync(path.resolve(root, file))) continue;
    if (!objects.has(file)) objects.set(file, new Map((read(file).save.regions.Templates.GameObjects ?? []).map((value) => [value.MapKey.value, value])));
    matches.push({ file, byId: objects.get(file) });
  }
  return matches;
};
const xyz = ["x", "y", "z"], vector = (value) => String(value).split(/\s+/).map(Number);
const close = (actual, expected) => actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= 1e-7);
const projection = (candidate, native) => {
  const initial = vector(native.object.Transform[0].Position.value);
  assert(close(initial, xyz.map((key) => (candidate.sourcePosition ?? candidate.position)[key])));
  let point = initial, level = native.object.LevelName.value;
  const evidence = [native.file];
  assert.equal(candidate.authoredLevel ?? candidate.level, level);
  assert(!candidate.positionSuppressed);
  if (candidate.templateProjection) assert(!candidate.positionTransform, "Mixed template and original position transform");
  for (const chain of candidate.templateProjection?.chain ?? []) {
    const transform = transforms.templateTransforms.find(({ id }) => id === chain.id);
    assert(transform && transform.childLevel === level);
    assert.equal(chain.childLevel, level); assert.equal(chain.parentLevel, transform.parentLevel);
    const instance = nativeObjects(transform.provenance.sourcePath).map(({ file, byId }) => ({ file, object: byId.get(transform.mapKey) })).find(({ object }) => object);
    assert(instance, `Missing native template instance: ${chain.id}`);
    const nativeTransform = instance.object.Transform[0];
    const translation = vector(nativeTransform.Position.value), quaternion = vector(nativeTransform.RotationQuat.value);
    const scale = nativeTransform.Scale.value;
    assert.deepEqual(xyz.map((key) => chain.position[key]), translation);
    assert.deepEqual([...xyz, "w"].map((key) => chain.rotation[key]), quaternion);
    assert.equal(chain.scale, scale); assert.equal(instance.object.LevelName.value, chain.parentLevel);
    const [x, y, z, w] = quaternion;
    const matrix = [[w*w+x*x-y*y-z*z, 2*(x*y-w*z), 2*(x*z+w*y)],
      [2*(x*y+w*z), w*w-x*x+y*y-z*z, 2*(y*z-w*x)], [2*(x*z-w*y), 2*(y*z+w*x), w*w-x*x-y*y+z*z]];
    point = matrix.map((row, index) => row.reduce((sum, value, axis) => sum + value * point[axis] * scale, translation[index]));
    level = chain.parentLevel; evidence.push(instance.file);
  }
  const mapTransform = candidate.templateProjection?.mapTransform ?? candidate.positionTransform;
  if (mapTransform) {
    const actual = [...transforms.transforms, ...(transforms.spatialTransforms ?? [])].find(({ id }) => id === mapTransform.id);
    assert(actual); assert.deepEqual(mapTransform.offset, actual.offset);
    assert.equal(mapTransform.rotationQuarterTurns, actual.rotationQuarterTurns ?? 0);
    const turn = ((mapTransform.rotationQuarterTurns % 4) + 4) % 4;
    const [x, y, z] = point;
    point = [[x, y, z], [-z, y, x], [-x, y, -z], [z, y, -x]][turn];
    point[0] += actual.offset.x; point[2] += actual.offset.z;
  }
  assert.equal(level, candidate.level);
  assert(close(point, xyz.map((key) => candidate.position[key])), `Native instance projection disagrees: ${candidate.id}`);
  return evidence;
};
let comparedCandidates = 0;
for (const mapId of manifest.maps) {
  const filename = `map-sources/catalog/${mapId}-placements.json`;
  const old = new Map(read(path.join(beforeRoot, filename)).candidates.map((value) => [value.id, value]));
  const current = read(path.join(afterRoot, filename)).candidates;
  for (const candidate of current) {
    const previous = old.get(candidate.id);
    if (!previous) { additions.push({ mapId, id: candidate.id }); continue; }
    old.delete(candidate.id); comparedCandidates++;
    if (!isDeepStrictEqual(candidate.position, previous.position)) positionChanges.push({ mapId, id: candidate.id });
    const fields = ["authoredLevel", "sourcePosition", "positionTransform", "templateProjection", "positionSuppressed"]
      .filter((key) => !isDeepStrictEqual(previous[key], candidate[key]));
    if (!fields.length) continue;
    const anchorId = candidate.storyDestination?.anchorContentId ?? candidate.partyPosition?.anchorContentId ?? candidate.itemLocation?.ownerContentId;
    assert(anchorId, `Changed provenance lacks a source anchor: ${mapId}/${candidate.id}`);
    const sourcePaths = candidate.provenance.filter(({ sourcePath }) => sourcePath.endsWith(".lsj")).map(({ sourcePath }) => sourcePath);
    // An initial-inventory relation identifies its owner in the native story,
    // even when the carried item's provenance does not list that owner's file.
    if (candidate.itemLocation && candidate.authoredLevel) sourcePaths.push(`Mods/${candidate.module}/Levels/${candidate.authoredLevel}/Items/_merged.lsj`);
    const nativeMatches = sourcePaths
      .flatMap((sourcePath) => nativeObjects(sourcePath).map(({ file, byId }) => ({ file, object: byId.get(anchorId) })))
      .filter(({ object }) => object?.Transform?.[0]?.Position && object.LevelName.value === (candidate.authoredLevel ?? candidate.level));
    assert(nativeMatches.length, `Native anchor not found: ${mapId}/${candidate.id}`);
    const sourceEvidence = projection(candidate, nativeMatches[0]);
    entries.push({ mapId, contentId: candidate.id, anchorId, fields, sourceEvidence });
  }
  for (const id of old.keys()) losses.push({ mapId, id });
}
assert.equal(losses.length, 0, "Raw regeneration lost pre-existing candidates");
assert.equal(positionChanges.length, 0, "Raw regeneration moved pre-existing world positions");
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
const report = { kind: "placement-anchor-provenance-source-audit", errors: [], beforeRoot, afterRoot,
  scope: "Every changed coordinate-provenance record reconstructed from its native anchor and native template-instance matrices; original world positions and candidate identities conserved. New NPC additions have their own source audit. Does not certify unchanged legacy provenance or runtime state.",
  stats: { maps: manifest.maps.length, comparedCandidates, correctedProvenance: entries.length, addedCandidates: additions.length,
    lostCandidates: losses.length, movedWorldPositions: positionChanges.length }, entries, additions, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
