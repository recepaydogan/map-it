import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { build } from "esbuild";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Read real native declarations, rule blocks and placement transforms without
// importing the NPC, scene, movement or coordinate producers being audited.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-reviewed-npc-scenes.mjs <old-relations> <old-scenes> <old-map-stage> <generator-stage> <items> <report>");
const [oldRelationsPath, oldScenesPath, baseline, stage, itemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const bytes = (filename) => {
  const file = path.resolve(root, filename), value = fs.readFileSync(file);
  const key = path.relative(root, file).split(path.sep).join("/"), hash = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Source changed: ${key}`);
  hashes[key] = hash;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "unfinalized-placement-stage");
const config = read(manifest.configPath), scenes = read(manifest.sceneContentPath), oldScenes = read(oldScenesPath);
const relations = read(manifest.storyLocationsPath), oldRelations = read(oldRelationsPath);
const recipe = read(relations.npcSceneReviews.recipe), members = read(config.partyMembers).members;
for (const [file, hash] of Object.entries({ ...relations.npcSceneReviews.hashes, ...scenes.hashes })) {
  bytes(file);
  assert.equal(hashes[file], hash, `Stale scene evidence: ${file}`);
}
for (const map of config.maps) for (const file of ["content.json", "locations.json", "metadata.json"]) bytes(`public/maps/${map.id}/${file}`);
bytes("public/data/item-database.json");
for (const file of [import.meta.filename, "scripts/build-story-location-relation-catalog.mjs", "scripts/build-scene-content-catalog.mjs",
  "scripts/build-placement-catalog.mjs", "scripts/lib/reviewed-npc-scenes.mjs", "scripts/lib/reviewed-story-rules.mjs",
  "scripts/lib/scene-content-profile.mjs", "scripts/lib/placement-at-anchor.mjs"]) bytes(file);
const normalize = (line) => line.replace(/\s+\/\/.*$/, "").trim().replace(/;$/, "").replace(/\s+/g, " ");
const sources = new Map();
const linesFor = (file) => {
  if (!sources.has(file)) sources.set(file, bytes(file).toString("utf8").split(/\r?\n/));
  return sources.get(file);
};
const rule = (file, line) => {
  const lines = linesFor(file);
  let first = line - 1;
  while (first >= 0 && !["PROC", "QRY", "IF"].includes(lines[first].trim())) first--;
  assert(first >= 0);
  let end = first + 1;
  while (end < lines.length && !["PROC", "QRY", "IF", "EXITSECTION", "INITSECTION"].includes(lines[end].trim())) end++;
  const then = lines.findIndex((value, index) => index > first && index < end && value.trim() === "THEN");
  assert(then > first && line - 1 > then && line - 1 < end);
  const evidence = [];
  for (let index = first + 1; index < end; index++) {
    const statement = normalize(lines[index]);
    if (statement && !statement.startsWith("//") && !["AND", "THEN"].includes(statement)) evidence.push({ sourcePath: file, sourceLine: index + 1, statement });
  }
  const guards = evidence.filter(({ sourceLine }) => sourceLine - 1 < then).map(({ statement }) => statement);
  assert(!guards.some((guard) => /DEBUG|Debug_/.test(guard)), "A debug rule is not NPC scene evidence");
  return { evidence, guards, actions: evidence.filter(({ sourceLine }) => sourceLine - 1 > then).map(({ statement }) => statement) };
};
const reviews = new Map();
for (const review of recipe.reviews) {
  assert(!reviews.has(review.id));
  const actual = rule(review.sourcePath, review.actionLine);
  assert.deepEqual(actual.guards, review.requiredGuards.map(normalize), `Native guards: ${review.id}`);
  assert(review.requiredActions.length);
  for (const action of review.requiredActions) assert(actual.actions.includes(normalize(action)), `Native action: ${review.id}`);
  reviews.set(review.id, actual);
}
const args = (statement) => statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"))
  .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((value) => value.trim().replace(/^\([A-Z]+\)/, ""));
const idOf = (value) => value.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)?.[0].toLowerCase();
const expected = [];
let rosterRows = 0;
for (const scene of recipe.scenes) {
  const native = linesFor(scene.sourcePath), start = native.indexOf("INITSECTION"), end = native.indexOf("KBSECTION");
  assert(start >= 0 && end > start);
  const movement = recipe.reviews.find(({ id }) => id === scene.movementReview);
  const move = normalize(native[movement.actionLine - 1]);
  const guard = reviews.get(scene.movementReview).guards.find((value) => value.startsWith(`${scene.tablePredicate}(`));
  const exclusion = reviews.get(scene.avatarExclusionReview);
  const excludeGuard = exclusion.guards.find((value) => value.startsWith(`${scene.tablePredicate}(`));
  assert(exclusion.actions.includes(`NOT ${excludeGuard}`));
  assert(exclusion.guards.includes(`${scene.avatarPredicate}(${args(excludeGuard)[scene.actorArgument]})`));
  for (let index = start + 1; index < end; index++) {
    const statement = normalize(native[index]);
    if (!statement.startsWith(`${scene.tablePredicate}(`)) continue;
    rosterRows++;
    const values = args(statement), characterId = idOf(values[scene.actorArgument]), anchorId = idOf(values[scene.anchorArgument]);
    if (!new RegExp(recipe.excludedActorNamePattern, "i").test(values[scene.actorArgument])) continue;
    const bound = new Map(args(guard).map((key, offset) => [key, values[offset]]));
    assert.deepEqual(args(move).slice(0, 2).map((key) => idOf(bound.get(key))), [characterId, anchorId]);
    const declaration = { sourcePath: scene.sourcePath, sourceLine: index + 1, statement };
    const profile = recipe.profiles.find((value) => value.characterContentId === characterId && value.anchorContentId === anchorId);
    assert(profile && profile.kind === "party-member" && profile.omitAuthoredCombat);
    assert.deepEqual(profile.destinationBinding, omit(declaration, ["sourcePath"]));
    assert.equal(profile.destinationSource, scene.sourcePath);
    assert.equal(profile.destinationLine, movement.actionLine);
    assert.deepEqual(profile.reviews, scene.reviews);
    const evidence = (entries) => [...new Map(entries.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()];
    const fullEvidence = scene.reviews.flatMap((id) => reviews.get(id).evidence);
    const relationId = `${characterId}:teleport:${anchorId}`, relation = relations.scriptedDestinations.find(({ id }) => id === relationId);
    assert(relation && !oldRelations.scriptedDestinations.some(({ id }) => id === relationId));
    assert.deepEqual(relation.npcScene, { id: scene.id, evidence: evidence([declaration, ...fullEvidence]) });
    const generated = scenes.profiles.find(({ id }) => id === profile.id);
    assert.deepEqual(generated, { ...omit(profile, ["destinationSource", "destinationLine", "destinationBinding", "reviews"]),
      evidence: evidence([declaration, ...rule(scene.sourcePath, movement.actionLine).evidence, ...fullEvidence]) });
    assert(members.some(({ characterId: id }) => id === characterId));
    expected.push({ characterId, anchorId, relationId, contentId: `${characterId}:destination:${anchorId}`, profile: generated });
  }
}
assert.equal(recipe.profiles.length, expected.length);
const newIds = new Set(expected.map(({ relationId }) => relationId));
assert.equal(newIds.size, expected.length);
assert.deepEqual(relations.scriptedDestinations.filter(({ id }) => !newIds.has(id)), oldRelations.scriptedDestinations);
assert.deepEqual(omit(relations, ["scriptedDestinations", "scriptedDestinationsByCharacterId", "stats", "npcSceneReviews"]),
  omit(oldRelations, ["scriptedDestinations", "scriptedDestinationsByCharacterId", "stats", "npcSceneReviews"]));
assert.deepEqual(omit(relations.stats, ["scriptedDestinations", "scriptedDestinationCharacters"]), omit(oldRelations.stats, ["scriptedDestinations", "scriptedDestinationCharacters"]));
assert.equal(relations.stats.scriptedDestinations, oldRelations.stats.scriptedDestinations + expected.length);
assert.deepEqual(relations.scriptedDestinationsByCharacterId, { ...Object.groupBy(relations.scriptedDestinations, ({ character }) => character.id) });
assert.equal(relations.stats.scriptedDestinationCharacters, Object.keys(relations.scriptedDestinationsByCharacterId).length);
assert.deepEqual(scenes.profiles.filter((profile) => !expected.some((entry) => entry.profile.id === profile.id)), oldScenes.profiles);
const transforms = read(config.levelTransforms);
const nativeObjects = new Map();
const objectAt = (relative, id) => {
  for (const directory of ["map-sources/extracted/package-placements", "map-sources/converted/main-level-placements",
    "map-sources/converted/wld-placements", "map-sources/converted/auxiliary-level-placements", "map-sources/extracted/level-templates"]) {
    const file = path.join(directory, relative.replace(/^supplementary\//, ""));
    if (!fs.existsSync(path.resolve(root, file))) continue;
    if (!nativeObjects.has(file)) nativeObjects.set(file, new Map(read(file).save.regions.Templates.GameObjects.map((value) => [value.MapKey.value, value])));
    if (nativeObjects.get(file).has(id)) return { file, object: nativeObjects.get(file).get(id) };
  }
  throw new Error(`Native placement missing: ${relative}/${id}`);
};
const vector = (text) => text.split(/\s+/).map(Number);
const items = read(itemsPath).items;
const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
  'export { getMapLootRows } from "./src/features/map/map-loot-utils"; export { getMapLootDisplayRows } from "./src/features/map/map-loot-display-rows";' },
bundle: true, platform: "node", format: "esm", write: false, metafile: true });
for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") bytes(file);
const selectors = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const entries = [];
let retainedEntities = 0, retainedMarkers = 0, conditionalRows = 0;
for (const mapId of manifest.maps) {
  const folder = `public/maps/${mapId}`;
  const before = read(path.join(baseline, folder, "content.json")), current = read(path.join(stage, folder, "content.json"));
  const oldMarkers = read(path.join(baseline, folder, "locations.json")), markers = read(path.join(stage, folder, "locations.json"));
  const metadata = read(path.join(baseline, folder, "metadata.json"));
  const candidates = read(path.join(stage, "map-sources/catalog", `${mapId}-placements.json`)).candidates;
  const added = current.entities.filter(({ id }) => !before.entities.some((entity) => entity.id === id));
  assert.deepEqual(omit(current, ["entities"]), omit(before, ["entities"]));
  assert.deepEqual(omit(markers, ["locations"]), omit(oldMarkers, ["locations"]));
  assert.deepEqual(current.entities.filter(({ id }) => !added.some((entity) => entity.id === id)), before.entities);
  assert.deepEqual(markers.locations.filter(({ contentId }) => !added.some((entity) => entity.id === contentId)), oldMarkers.locations);
  retainedEntities += before.entities.length; retainedMarkers += oldMarkers.locations.length;
  const raster = await sharp(bytes(`public/maps/${mapId}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const entity of added) {
    const target = expected.find(({ contentId }) => contentId === entity.id);
    assert(target, `Unreviewed added entity ${mapId}/${entity.id}`);
    const candidate = candidates.find(({ id }) => id === entity.id), profile = target.profile;
    const marker = markers.locations.filter(({ contentId }) => contentId === entity.id);
    assert.equal(marker.length, 1); assert.equal(marker[0].category, "party-member");
    assert.equal(entity.kind, "party-member"); assert(!entity.gameplay?.combat);
    assert.equal(entity.partyMember.memberId, members.find(({ characterId }) => characterId === target.characterId).id);
    assert.deepEqual(omit(entity.sceneContext, ["authoredCombat"]), { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence });
    assert.equal(entity.authoredEquipment.scene, "requires-scene-review");
    assert(entity.authoredEquipment.groups.every(({ entries }) => entries.every(({ status }) => status === "requires-scene-review")));
    const native = objectAt(candidate.provenance.find(({ sourcePath }) => /\/Triggers\//.test(sourcePath)).sourcePath, target.anchorId);
    const source = vector(native.object.Transform[0].Position.value), xyz = ["x", "y", "z"];
    assert.deepEqual(xyz.map((key) => candidate.sourcePosition[key]), source);
    assert.equal(candidate.authoredLevel, native.object.LevelName.value);
    assert(!candidate.positionTransform && !candidate.positionSuppressed, "Inherited source coordinate provenance");
    assert.equal(candidate.templateProjection.chain.length, 1, "This native scene requires a reviewed single-instance projection");
    const chain = candidate.templateProjection.chain[0], transform = transforms.templateTransforms.find(({ id }) => id === chain.id);
    assert(transform && transform.childLevel === candidate.authoredLevel && transform.parentLevel === candidate.level);
    const instance = objectAt(transform.provenance.sourcePath, transform.mapKey);
    const instanceTransform = instance.object.Transform[0];
    const translation = vector(instanceTransform.Position.value);
    assert.deepEqual(vector(instanceTransform.RotationQuat.value), [0, 0, 0, 1]);
    assert.equal(instanceTransform.Scale.value, 1);
    assert.deepEqual(xyz.map((key) => chain.position[key]), translation);
    assert.deepEqual(chain.rotation, { x: 0, y: 0, z: 0, w: 1 }); assert.equal(chain.scale, 1);
    assert(!candidate.templateProjection.mapTransform, "An additional map transform needs source review");
    assert.deepEqual(xyz.map((key) => entity.worldPosition[key]), source.map((value, index) => value + translation[index]));
    assert.deepEqual(candidate.position, entity.worldPosition);
    const definition = config.maps.find(({ id }) => id === mapId);
    assert(new RegExp(definition.levelPattern).test(transform.parentLevel));
    assert(!definition.floorVolumeSelection, "This audit does not assume floor-volume containment");
    const { worldBounds: world, imageBounds: image, flipY } = metadata.coordinateReference;
    const x = image.x + (entity.worldPosition.x - world.x) / world.width * image.width;
    const y = image.y + (flipY ? 1 - (entity.worldPosition.z - world.y) / world.height : (entity.worldPosition.z - world.y) / world.height) * image.height;
    assert(Math.abs(marker[0].x - x) <= 0.00051 && Math.abs(marker[0].y - y) <= 0.00051);
    assert(x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height);
    const px = Math.round((x - image.x) / image.width * (raster.info.width - 1));
    const py = Math.round((y - image.y) / image.height * (raster.info.height - 1));
    const alpha = raster.data[(py * raster.info.width + px) * raster.info.channels + 3];
    assert(alpha > 16, `New scene is on transparent pixels: ${entity.id}`);
    const rows = selectors.getMapLootRows(entity.deathLoot, entity.containerLoot);
    if (rows.length) {
      assert.deepEqual(entity.deathLoot.availability, { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence });
      assert(rows.every(({ certainty, chance }) => certainty === "conditional" && chance === undefined));
      const display = selectors.getMapLootDisplayRows(rows, items);
      assert(display.length && display.every(({ certainty, chance }) => certainty === "conditional" && chance === undefined));
      conditionalRows += rows.length;
    }
    entries.push({ mapId, contentId: entity.id, title: entity.title, anchorSource: native.file, instanceSource: instance.file,
      worldPosition: entity.worldPosition, mapPosition: { x: marker[0].x, y: marker[0].y }, alpha, conditionalLootRows: rows.length });
  }
}
assert.deepEqual(entries.map(({ contentId }) => contentId).sort(), expected.map(({ contentId }) => contentId).sort());
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash, `Source changed during audit: ${file}`);
const report = { kind: "native-reviewed-npc-scenes-audit", errors: [],
  stageRoot: stage, baselineRoot: baseline,
  scope: "Source-bound additions only: avatar exclusion, conditional NPC setup, exact native instance coordinates and opaque raster pixels, scene content, previous relation/profile/map conservation. Does not certify all runtime variants, other maps or publication.",
  stats: { nativeRosterRows: rosterRows, reviewedRules: reviews.size, addedScenes: entries.length,
    retainedRelations: oldRelations.scriptedDestinations.length, retainedProfiles: oldScenes.profiles.length,
    retainedEntities, retainedMarkers, conditionalRows, unchangedLiveFiles: config.maps.length * 3 + 1 }, entries, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
