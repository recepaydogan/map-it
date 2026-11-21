import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readNativeTeleportActions } from "./lib/native-teleport-actions.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (![5, 6].includes(process.argv.length)) throw new Error("Usage: audit-native-action-navigation.mjs <stage> <previous-raw-stage> <report> [full-record-reference-stage]");
const [stage, baseline, output, referenceStage = stage] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const read = (file) => {
  const data = fs.readFileSync(file), key = path.relative(root, file).replaceAll("\\", "/");
  const hash = createHash("sha256").update(data).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Changed audit input: ${key}`); hashes[key] = hash;
  return JSON.parse(data);
};
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const serialized = (value) => JSON.parse(JSON.stringify(value));
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "unfinalized-placement-stage");
const referenceManifest = read(path.join(referenceStage, "stage-manifest.json"));
assert.equal(referenceManifest.kind, manifest.kind);
assert.equal(referenceManifest.recordsIncluded, true, "Native position audit requires full reference records");
assert.deepEqual(omit(referenceManifest, ["maps", "recordsIncluded"]), omit(manifest, ["maps", "recordsIncluded"]), "Reference generation inputs differ");
const roots = ["map-sources/extracted/package-placements", "map-sources/converted/wld-placements",
  "map-sources/converted/main-level-placements", "map-sources/converted/auxiliary-level-placements"];
const originals = new Map(), actionRows = [], actionLists = new Map();
let nativeFiles = 0, actionObjects = 0;
for (const sourceRoot of roots) for (const relative of fs.readdirSync(path.join(root, sourceRoot), { recursive: true }).filter((file) => file.endsWith(".lsj"))) {
  const file = path.join(root, sourceRoot, relative), nativePath = relative.replaceAll("\\", "/");
  const document = read(file); nativeFiles += 1;
  for (const object of document.save.regions.Templates.GameObjects) {
    const expected = [];
    if (Object.hasOwn(object, "OnUsePeaceActions")) actionObjects += 1;
    for (let g = 0; g < (object.OnUsePeaceActions ?? []).length; g += 1) {
      const group = object.OnUsePeaceActions[g];
      for (let a = 0; a < (group.Action ?? []).length; a += 1) {
        const action = group.Action[a]; if (action.ActionType?.value !== 3) continue;
        for (let n = 0; n < (action.Attributes ?? []).length; n += 1) {
          const fields = action.Attributes[n];
          const entry = { sourceId: (fields.Source?.value ?? "").toLowerCase(), targetId: (fields.Target?.value ?? "").toLowerCase(),
            sourceType: fields.SourceType?.value, targetType: fields.Type?.value, conditions: fields.Conditions?.value ?? "",
            eventId: fields.EventID?.value ?? "", blockMapMarkerNavigation: fields.BlockMapMarkerNavigation?.value ?? false,
            snapToGround: fields.SnapToGround?.value, provenance: { sourcePath: nativePath, groupIndex: g, actionIndex: a, attributesIndex: n } };
          expected.push(entry); actionRows.push({ objectId: object.MapKey.value, level: object.LevelName?.value, nativePath, ...entry });
        }
      }
    }
    assert.deepEqual(readNativeTeleportActions(object, nativePath), Object.hasOwn(object, "OnUsePeaceActions") ? expected : undefined,
      `Native action parsing differs: ${nativePath}/${object.MapKey?.value}`);
    if (Object.hasOwn(object, "OnUsePeaceActions")) {
      const lists = actionLists.get(object.MapKey.value) ?? [];
      lists.push(serialized(expected)); actionLists.set(object.MapKey.value, lists);
    }
    const position = object.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
    if (position?.length === 3) {
      const entries = originals.get(object.MapKey.value) ?? [];
      entries.push({ file, nativePath, level: object.LevelName?.value, type: object.Type?.value,
        position: { x: position[0], y: position[1], z: position[2] } }); originals.set(object.MapKey.value, entries);
    }
  }
}
const transforms = read(path.join(root, "map-sources/catalog/level-transforms.json"));
const navigation = read(path.join(root, "map-sources/catalog/navigation-portals.json"));
const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.0001;
const verifyPosition = (record) => {
  assert(!record.templateProjection, `Template-chain position needs independent review: ${record.id}`);
  assert((originals.get(record.id) ?? []).some((source) => source.type === record.type
    && source.level === (record.authoredLevel ?? record.level) && near(source.position, record.sourcePosition ?? record.position)), `No original position: ${record.id}`);
  if (!record.positionTransform) return;
  const candidates = [...(transforms.transforms ?? []), ...(transforms.spatialTransforms ?? [])].filter((entry) => entry.id === record.positionTransform.id);
  assert.equal(candidates.length, 1, `Ambiguous position transform: ${record.id}`);
  const transform = candidates[0], p = record.sourcePosition;
  const turns = ((transform.rotationQuarterTurns ?? 0) % 4 + 4) % 4;
  const rotated = [[p.x, p.z], [-p.z, p.x], [-p.x, -p.z], [p.z, -p.x]][turns];
  assert(near(record.position, { x: rotated[0] + transform.offset.x, y: p.y, z: rotated[1] + transform.offset.z }), `Incorrect transformed action anchor: ${record.id}`);
};
const changes = [], additions = [];
let unchanged = 0, unchangedMarkers = 0, enrichedMarkerSearches = 0, candidateActionLists = 0;
const verifyAction = (objectId, action) => {
  assert(actionRows.some((row) => row.objectId === objectId
    && row.nativePath === action.provenance.sourcePath.replace(/^supplementary\//, "")
    && isDeepStrictEqual(serialized(omit(row, ["objectId", "level", "nativePath", "provenance"])), omit(action, ["provenance", "source", "target"]))
    && ["groupIndex", "actionIndex", "attributesIndex"].every((key) => row.provenance[key] === action.provenance[key])), `No exact native action: ${objectId}`);
};
for (const mapId of manifest.maps) {
  const before = read(path.join(baseline, "public/maps", mapId, "content.json"));
  const after = read(path.join(stage, "public/maps", mapId, "content.json"));
  const previous = new Map(before.entities.map((entity) => [entity.id, entity]));
  const current = new Map(after.entities.map((entity) => [entity.id, entity]));
  assert.equal(current.size, after.entities.length); assert.equal(previous.size, before.entities.length);
  assert.deepEqual(omit(after, ["entities"]), omit(before, ["entities"]), `Unrelated content metadata or relationships changed: ${mapId}`);
  for (const id of previous.keys()) assert(current.has(id), `Lost map entity: ${mapId}/${id}`);
  const oldLocations = read(path.join(baseline, "public/maps", mapId, "locations.json"));
  const newLocations = read(path.join(stage, "public/maps", mapId, "locations.json"));
  assert.deepEqual(omit(newLocations, ["locations"]), omit(oldLocations, ["locations"]));
  const markerById = new Map(newLocations.locations.map((entry) => [entry.id, entry]));
  assert.equal(markerById.size, newLocations.locations.length);
  for (const marker of oldLocations.locations) {
    const next = markerById.get(marker.id);
    if (isDeepStrictEqual(next, marker)) { unchangedMarkers += 1; continue; }
    assert(next && isDeepStrictEqual(omit(next, ["searchTerms"]), omit(marker, ["searchTerms"])), `Existing marker changed: ${mapId}/${marker.id}`);
    const owner = current.get(marker.contentId), oldOwner = previous.get(marker.contentId);
    assert(!oldOwner?.navigationPortal && owner?.navigationPortal?.actionBinding, `Unproven marker enrichment: ${mapId}/${marker.id}`);
    assert.deepEqual(next.searchTerms, [...marker.searchTerms,
      ...[owner.navigationPortal.sourceRegionId, owner.navigationPortal.targetRegionId].filter(Boolean)], `Unexpected marker search terms: ${mapId}/${marker.id}`);
    enrichedMarkerSearches += 1;
  }
  for (const marker of newLocations.locations) {
    assert(current.has(marker.contentId), `Marker without content: ${mapId}/${marker.id}`);
    if (!oldLocations.locations.some((entry) => entry.id === marker.id)) assert(current.get(marker.contentId).navigationDestination);
  }
  const candidates = read(path.join(stage, "map-sources/catalog", `${mapId}-placements.json`));
  const previousCandidates = read(path.join(baseline, "map-sources/catalog", `${mapId}-placements.json`));
  const candidateById = new Map(candidates.candidates.map((entry) => [entry.id, entry]));
  assert.equal(candidateById.size, candidates.candidates.length);
  assert.equal(candidates.stats.candidates, candidates.candidates.length);
  for (const old of previousCandidates.candidates) {
    const next = candidateById.get(old.id); assert(next, `Lost source candidate: ${mapId}/${old.id}`);
    assert(isDeepStrictEqual(omit(next, ["teleportActions", "navigationPortal"]), omit(old, ["teleportActions", "navigationPortal"])), `Unrelated candidate changed: ${mapId}/${old.id}`);
    if (old.navigationPortal) assert.deepEqual(next.navigationPortal, old.navigationPortal);
  }
  for (const candidate of candidates.candidates) if (candidate.teleportActions) {
    candidateActionLists += 1;
    const normalized = candidate.teleportActions.map((action) => ({ ...action,
      provenance: { ...action.provenance, sourcePath: action.provenance.sourcePath.replace(/^supplementary\//, "") } }));
    assert(actionLists.get(candidate.id)?.some((list) => isDeepStrictEqual(list, normalized)), `No complete native action list: ${mapId}/${candidate.id}`);
    for (const action of candidate.teleportActions) verifyAction(candidate.id, action);
  }
  assert.deepEqual(read(path.join(stage, "map-sources/catalog", `${mapId}-placement-rejections.json`)),
    read(path.join(baseline, "map-sources/catalog", `${mapId}-placement-rejections.json`)), `Rejected source records changed: ${mapId}`);
  let records;
  for (const entity of after.entities) {
    const old = previous.get(entity.id);
    if (isDeepStrictEqual(old, entity)) { unchanged += 1; continue; }
    if (!old) {
      assert(entity.navigationDestination, `Unexpected new entity: ${mapId}/${entity.id}`);
      additions.push({ mapId, id: entity.id, destination: entity.navigationDestination, position: entity.worldPosition }); continue;
    }
    assert(isDeepStrictEqual(omit(old, ["navigationPortal"]), omit(entity, ["navigationPortal"])), `Unrelated entity content changed: ${mapId}/${entity.id}`);
    assert(!old.navigationPortal, `Existing navigation profile replaced: ${mapId}/${entity.id}`);
    const portal = entity.navigationPortal, binding = portal?.actionBinding;
    assert.equal(binding?.kind, "native-teleport-action"); assert.equal(binding.objectId, entity.id);
    const native = navigation.portals.find((entry) => entry.id === portal.id && entry.module === portal.module && entry.level === portal.level);
    assert(native); assert.deepEqual(native.sourcePosition, portal.sourcePosition); assert.deepEqual(native.targetPosition, portal.targetPosition);
    assert.equal(native.sourceRegionId, portal.sourceRegionId); assert.equal(native.targetRegionId, portal.targetRegionId);
    assert(referenceManifest.maps.includes(mapId), `Changed map needs full reference records: ${mapId}`);
    if (!records) {
      const reference = read(path.join(referenceStage, "map-sources/catalog", `${mapId}-placements.json`));
      for (const candidate of candidates.candidates.filter((entry) => entry.navigationPortal?.actionBinding)) {
        assert(isDeepStrictEqual(reference.candidates.find((entry) => entry.id === candidate.id), candidate), `Full-record reference candidate differs: ${mapId}/${candidate.id}`);
      }
      records = new Map(reference.records.map((record) => [record.id, record]));
    }
    const owner = records.get(entity.id); verifyPosition(owner);
    assert.equal(new Set(owner.teleportActions.filter((action) => !action.blockMapMarkerNavigation).map((action) => action.targetId)).size, 1);
    for (const action of binding.actions) {
      verifyAction(entity.id, action);
      for (const [key, id] of [["source", action.sourceId], ["target", action.targetId]]) {
        const reference = records.get(id); assert(reference); verifyPosition(reference);
        assert.deepEqual(action[key], { id, level: reference.level, position: reference.position });
      }
      assert(near(action.target.position, portal.targetPosition));
      assert.equal(action.blockMapMarkerNavigation, false);
    }
    changes.push({ mapId, id: entity.id, title: entity.title, portalId: portal.id, actions: binding.actions });
  }
}
for (const addition of additions) {
  const portal = navigation.portals.find((entry) => `${entry.module}/${entry.level}/${entry.id}` === addition.destination.instanceId);
  assert(portal && near(addition.position, portal.targetPosition), `Unproven arrival: ${addition.id}`);
}
const distinct = [...new Map(actionRows.map((entry) => [JSON.stringify(omit(entry, ["nativePath", "provenance"])), entry])).values()];
for (const file of [import.meta.filename, "scripts/lib/native-teleport-actions.mjs", "scripts/lib/navigation-portal.mjs",
  "scripts/build-placement-catalog.mjs", "scripts/build-registered-placement-maps.mjs"]) {
  const absolute = path.resolve(root, file);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
}
const report = { kind: "native-action-navigation-source-and-conservation", errors: [], stage, baseline, referenceStage,
  stats: { maps: manifest.maps.length, nativeFiles, actionObjects, nativeActionRows: actionRows.length, distinctActionDefinitions: distinct.length,
    conditionalActionDefinitions: distinct.filter((entry) => entry.conditions).length, unchangedEntities: unchanged, unchangedMarkers, enrichedMarkerSearches, candidateActionLists,
    changedEntities: changes.length, addedArrivals: additions.length },
  changes, additions, hashes,
  scope: "Independently reconstructs native action parsing, verifies complete candidate action lists and proves new bindings against original objects, target positions and AI endpoints. Preserves every old entity except an added navigation profile; marker changes are limited to that profile's exact region search terms. Rejected records and unrelated candidate fields are preserved. Only direct/offset anchor transforms are supported; more complex cases fail for review. Does not prove marker projection, final cross-map routing, all action coverage, conditional UI presentation or live publication." };
for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), expected);
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
