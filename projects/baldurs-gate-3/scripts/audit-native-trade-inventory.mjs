import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { verifyNativeEntranceAnchor } from "./lib/native-entrance-audit.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Audit completed real map exports against native placed actors. Deliberately
// do not import the stock builder, title resolver, or scene-profile mutator.
assert.equal(process.argv.length, 5, "Usage: audit-native-trade-inventory.mjs <before-stage> <after-stage> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [before, after, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, nativeFiles = new Map();
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = createHash("sha256").update(data).digest("hex");
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const sorted = (values) => [...new Set(values)].sort();
const rows = (document) => Array.isArray(document.entities) ? document.entities : Object.values(document.entities);
const manifest = read(path.join(after, "stage-manifest.json"));
const previous = read(path.join(before, "stage-manifest.json"));
const config = read(manifest.configPath);
const floors = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const contains = (volume, point) => {
  if (point.y < volume.minHeight || point.y >= volume.maxHeight) return false;
  let winding = 0;
  for (let i = 0; i < volume.polygon.length; i++) {
    const a = volume.polygon[i], b = volume.polygon[(i + 1) % volume.polygon.length];
    const cross = (b.x - a.x) * (point.z - a.z) - (point.x - a.x) * (b.z - a.z);
    if (Math.abs(cross) < 1e-8 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z)) return true;
    if (a.z <= point.z && point.z < b.z && cross > 0) winding++;
    if (b.z <= point.z && point.z < a.z && cross < 0) winding--;
  }
  return winding !== 0;
};
for (const key of ["storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath", "gameplayStatsPath"]) {
  assert.equal(manifest[key], previous[key], `Changed source catalog: ${key}`);
  if (manifest[key]) bytes(manifest[key]);
}
const treasure = read(config.treasureTables), gameplay = read(manifest.gameplayStatsPath), templates = read(config.rootTemplates);
const members = read(config.partyMembers).members;
const titleFor = (id) => {
  const stats = gameplay.entries[id] ?? gameplay.entries[id.replace(/^I_/, "")];
  return templates.templates[stats?.rootTemplate?.toLowerCase()]?.displayName?.en ?? "";
};
const nativeTables = (candidate, map) => {
  const nativeId = candidate.storyDestination?.characterContentId
    ?? (candidate.partyPosition ? members.find(({ id }) => id === candidate.partyPosition.memberId)?.characterId : null)
    ?? candidate.id.split(":")[0];
  const tables = [], sources = [];
  for (const { sourcePath } of candidate.provenance) {
    if (!sourcePath.endsWith(".lsj") || sourcePath.startsWith("root-templates/")) continue;
    const options = sourcePath.startsWith("supplementary/")
      ? config.supplementaryPlacementRoots.map((directory) => path.resolve(root, directory, sourcePath.slice(14)))
      : [path.resolve(root, config.placementRoots[map.placementRoot], sourcePath)];
    const existing = options.filter((file) => fs.existsSync(file));
    assert(existing.length <= 1, `Ambiguous native source: ${sourcePath}`);
    if (!existing.length) continue;
    const file = existing[0];
    if (!nativeFiles.has(file)) {
      const objects = read(file).save?.regions?.Templates?.GameObjects;
      assert(Array.isArray(objects), `Missing native objects: ${file}`);
      nativeFiles.set(file, new Map(objects.map((object) => [object.MapKey?.value, object])));
    }
    const actor = nativeFiles.get(file).get(nativeId);
    if (!actor) continue;
    sources.push({ sourcePath: path.relative(root, file).replaceAll("\\", "/"), objectId: nativeId });
    for (const group of actor.TradeTreasures ?? []) for (const item of group.TreasureItem ?? []) {
      assert.equal(typeof item.Object?.value, "string"); tables.push(item.Object.value);
    }
  }
  assert(sources.length, `No exact native actor: ${candidate.id}`);
  assert.deepEqual(sorted(candidate.tradeTreasures ?? []), sorted(tables), `Trade pool differs from native actor: ${candidate.id}`);
  return sources;
};
const stats = { maps: 0, candidates: 0, profiles: 0, archivedSceneProfiles: 0, emptyPools: 0,
  unchangedVendors: 0, stockIds: 0, namedStockEntries: 0, unresolvedStockIds: 0, unresolvedTradeTables: 0 };
const additions = [], entranceChanges = [], recoveredAppearances = [], unexpectedDeltas = [], unresolved = [];
assert.deepEqual(sorted(manifest.maps), sorted(previous.maps));
const baselineAppearances = new Map();
for (const mapId of previous.maps) {
  const placement = read(path.join(before, `map-sources/catalog/${mapId}-placements.json`));
  const content = read(path.join(before, `public/maps/${mapId}/content.json`));
  const entities = new Map(rows(content).map((entity) => [entity.id, entity]));
  for (const candidate of placement.candidates) {
    const appearances = baselineAppearances.get(candidate.id) ?? [];
    appearances.push({ mapId, candidate, entity: entities.get(candidate.id) });
    baselineAppearances.set(candidate.id, appearances);
  }
}
for (const mapId of manifest.maps) {
  assert(previous.maps.includes(mapId), `No baseline map: ${mapId}`);
  stats.maps++;
  const map = config.maps.find(({ id }) => id === mapId);
  const load = (directory, file) => read(path.join(directory, file));
  const placementFile = `map-sources/catalog/${mapId}-placements.json`;
  const oldPlacement = load(before, placementFile), placement = load(after, placementFile);
  const oldCandidates = new Map(oldPlacement.candidates.map((candidate) => [candidate.id, candidate]));
  const candidateIds = sorted(placement.candidates.map(({ id }) => id));
  assert.equal(candidateIds.length, placement.candidates.length, `Duplicate candidate: ${mapId}`);
  assert([...oldCandidates.keys()].every((id) => candidateIds.includes(id)), `Lost candidate: ${mapId}`);
  const changedAnchors = new Set(), recovered = new Map();
  for (const candidate of placement.candidates) {
    let old = oldCandidates.get(candidate.id);
    const isRecovery = !old;
    if (isRecovery) {
      const rejected = oldPlacement.silhouetteRejectedCandidates.find(({ id }) => id === candidate.id);
      assert(rejected, `New appearance was not a rejected baseline pivot: ${mapId}/${candidate.id}`);
      assert.deepEqual(rejected.worldPosition, candidate.position);
      assert.deepEqual(rejected.mapPosition, candidate.mapPositionAdjustment?.original);
      assert.equal(rejected.module, candidate.module); assert.equal(rejected.level, candidate.level);
      const counterparts = (baselineAppearances.get(candidate.id) ?? []).filter(({ candidate: source }) =>
        isDeepStrictEqual(omit(source, ["mapPosition", "mapPositionAdjustment"]), omit(candidate, ["mapPosition", "mapPositionAdjustment"])));
      assert(counterparts.length, `Recovered identity lacks an identical baseline source record: ${candidate.id}`);
      old = counterparts[0].candidate;
      for (const counterpart of counterparts) assert.deepEqual(counterpart.entity, counterparts[0].entity);
      recovered.set(candidate.id, counterparts[0]);
      const sourcePath = candidate.provenance.find(({ sourcePath }) => !sourcePath.startsWith("supplementary/") && sourcePath.endsWith(".lsj"))?.sourcePath;
      assert(sourcePath && !sourcePath.split("/").includes(".."));
      const native = read(path.join(root, config.placementRoots[map.placementRoot], sourcePath)).save.regions.Templates.GameObjects
        .filter((object) => object.MapKey?.value === candidate.id);
      assert.equal(native.length, 1); assert.equal(native[0].TemplateName.value, candidate.templateId);
      assert.equal(native[0].LevelName.value, candidate.level); assert.equal(native[0].Name.value, candidate.internalName);
      const position = native[0].Transform[0].Position.value.trim().split(/\s+/).map(Number);
      assert.deepEqual(position, [candidate.position.x, candidate.position.y, candidate.position.z]);
    }
    if (isDeepStrictEqual(candidate, old)) continue;
    if (!isDeepStrictEqual(omit(candidate, ["mapPosition", "mapPositionAdjustment"]), omit(old, ["mapPosition", "mapPositionAdjustment"]))) {
      unexpectedDeltas.push({ mapId, id: candidate.id, kind: "candidate",
        fields: sorted([...Object.keys(candidate), ...Object.keys(old)]).filter((key) => !isDeepStrictEqual(candidate[key], old[key])) });
      continue;
    }
    const selection = map.floorVolumeSelection;
    const selected = selection ? floors.entries.filter((row) => row.mapId === selection.mapId && row.status === "resolved-native-volume"
      && selection.patchIds.includes(row.volume.id)).map(({ volume }) => volume) : [];
    if (selection) assert.equal(selected.length, selection.patchIds.length);
    const buildings = new Set(selected.map(({ buildingId }) => buildingId));
    const siblings = selection ? floors.entries.filter((row) => row.mapId === selection.mapId && row.status === "resolved-native-volume"
      && buildings.has(row.volume.buildingId)).map(({ volume }) => volume) : [];
    const onFloor = (point) => !selection || selection.patchIds.includes(siblings.filter((volume) => contains(volume, point))
      .sort((a, b) => b.minHeight - a.minHeight || a.id.localeCompare(b.id, "en"))[0]?.id);
    const metadata = read(`public/maps/${mapId}/metadata.json`);
    const { data, info } = await sharp(bytes(`public/maps/${mapId}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const evidence = verifyNativeEntranceAnchor(candidate, { readJson: read, sourceRoot: path.join(root, "map-sources/converted/navigation-portals"),
      reference: metadata.coordinateReference, mask: { data, width: info.width, height: info.height, channels: info.channels }, onFloor });
    changedAnchors.add(candidate.id);
    if (isRecovery) recoveredAppearances.push({ mapId, id: candidate.id, title: candidate.displayName.en,
      existingMapId: recovered.get(candidate.id).mapId, after: candidate.mapPosition, evidence,
      disposition: "raw-appearance-only-requires-routing-and-connection-review" });
    else entranceChanges.push({ mapId, id: candidate.id, title: candidate.displayName.en, before: old.mapPosition, after: candidate.mapPosition, evidence });
  }
  assert.deepEqual(omit(placement, ["generatedAt", "stats", "candidates", "silhouetteRejectedCandidates"]),
    omit(oldPlacement, ["generatedAt", "stats", "candidates", "silhouetteRejectedCandidates"]));
  assert.deepEqual(omit(placement.stats, ["candidates", "silhouetteRejectedCandidates"]),
    omit(oldPlacement.stats, ["candidates", "silhouetteRejectedCandidates"]));
  assert.equal(placement.stats.candidates, placement.candidates.length);
  assert.equal(placement.stats.silhouetteRejectedCandidates, placement.silhouetteRejectedCandidates.length);
  assert.deepEqual(placement.silhouetteRejectedCandidates, oldPlacement.silhouetteRejectedCandidates.filter(({ id }) => !recovered.has(id)));
  const markerFile = `public/maps/${mapId}/locations.json`;
  const oldMarkers = load(before, markerFile), markers = load(after, markerFile);
  assert.deepEqual(omit(markers, ["locations"]), omit(oldMarkers, ["locations"]));
  assert.deepEqual(markers.locations.filter(({ id }) => !recovered.has(id)).map(({ id }) => id), oldMarkers.locations.map(({ id }) => id));
  assert.deepEqual(sorted(markers.locations.map(({ id }) => id)), candidateIds);
  const oldMarkerById = new Map(oldMarkers.locations.map((marker) => [marker.id, marker]));
  for (const marker of markers.locations) {
    const old = oldMarkerById.get(marker.id) ?? load(before, `public/maps/${recovered.get(marker.id).mapId}/locations.json`).locations.find(({ id }) => id === marker.id);
    if (!changedAnchors.has(marker.id)) assert.deepEqual(marker, old);
    else {
      const fields = recovered.has(marker.id) ? ["x", "y", "region"] : ["x", "y"];
      assert.deepEqual(omit(marker, fields), omit(old, fields));
      if (recovered.has(marker.id)) assert.equal(marker.region, read(`public/maps/${mapId}/metadata.json`).displayName);
      assert.deepEqual({ x: marker.x, y: marker.y }, placement.candidates.find(({ id }) => id === marker.id).mapPosition);
    }
  }
  const rejectionFile = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const oldRejections = load(before, rejectionFile), rejections = load(after, rejectionFile);
  assert.deepEqual(omit(rejections, ["adjustedCandidates", "rejectedCandidates"]), omit(oldRejections, ["adjustedCandidates", "rejectedCandidates"]));
  assert.deepEqual(rejections.rejectedCandidates, oldRejections.rejectedCandidates.filter(({ id }) => !recovered.has(id)));
  assert.deepEqual(rejections.adjustedCandidates.filter(({ id }) => !changedAnchors.has(id)),
    oldRejections.adjustedCandidates.filter(({ id }) => !changedAnchors.has(id)));
  for (const id of changedAnchors) {
    assert.deepEqual(rejections.adjustedCandidates.find((row) => row.id === id)?.adjustment,
      placement.candidates.find((row) => row.id === id).mapPositionAdjustment);
  }
  const contentFile = `public/maps/${mapId}/content.json`;
  const oldContent = load(before, contentFile), content = load(after, contentFile);
  assert.deepEqual(omit(content, ["entities"]), omit(oldContent, ["entities"]));
  const oldEntities = new Map(rows(oldContent).map((entity) => [entity.id, entity]));
  assert.deepEqual(sorted(rows(content).map(({ id }) => id)), candidateIds);
  const candidates = new Map(placement.candidates.map((candidate) => [candidate.id, candidate]));
  for (const entity of rows(content)) {
    stats.candidates++;
    const old = oldEntities.get(entity.id) ?? recovered.get(entity.id)?.entity, candidate = candidates.get(entity.id);
    const archived = entity.sceneContext?.authoredTradeInventory;
    const withoutInventory = omit(entity, ["tradeInventory"]);
    if (archived) withoutInventory.sceneContext = omit(entity.sceneContext, ["authoredTradeInventory"]);
    assert.deepEqual(withoutInventory, old, `Unrelated content changed: ${mapId}/${entity.id}`);
    if (entity.vendor) {
      stats.unchangedVendors++;
      assert(!entity.tradeInventory && !archived, "Do not duplicate reviewed vendor stock");
      continue;
    }
    if (candidate.type !== "character" || !(candidate.tradeTreasures ?? []).length) {
      assert(!entity.tradeInventory && !archived); continue;
    }
    const sources = nativeTables(candidate, map);
    const tableIds = sorted(candidate.tradeTreasures);
    const missingTables = tableIds.filter((id) => !treasure.tables[id]);
    const pools = tableIds.flatMap((id) => treasure.tables[id] ?? []);
    const ids = sorted(pools.flatMap((pool) => pool.namedStockIds ?? []));
    const categories = sorted(pools.flatMap((pool) => pool.stockCategories ?? []));
    const missingIds = ids.filter((id) => !titleFor(id));
    const names = sorted(ids.map(titleFor).filter(Boolean));
    const inventory = entity.tradeInventory ?? archived;
    if (!ids.length && !categories.length && !missingTables.length) {
      stats.emptyPools++; assert(!inventory, "An empty source pool needs no profile"); continue;
    }
    assert(inventory, `Missing native stock: ${mapId}/${entity.id}`);
    assert.equal(inventory.sourceKind, "native-trade-pool");
    assert.equal(inventory.availability, "unverified");
    assert.equal(inventory.scope, "authored-placement");
    assert.deepEqual(sorted(inventory.tradeTables), tableIds);
    assert.deepEqual(sorted(inventory.stockIds), ids);
    assert.deepEqual(sorted(inventory.namedStock), names);
    assert.deepEqual(sorted(inventory.stockCategories), categories);
    assert.deepEqual(sorted(inventory.unresolvedStockIds ?? []), missingIds);
    assert.deepEqual(sorted(inventory.unresolvedTradeTables ?? []), missingTables);
    if (entity.sceneContext?.inventoryChange) {
      assert(archived && !entity.tradeInventory, "Authored pool cannot become current scene stock"); stats.archivedSceneProfiles++;
    } else { assert(!archived); stats.profiles++; }
    stats.stockIds += ids.length; stats.namedStockEntries += names.length;
    stats.unresolvedStockIds += missingIds.length; stats.unresolvedTradeTables += missingTables.length;
    additions.push({ mapId, id: entity.id, title: entity.title, kind: entity.kind,
      tradeTables: tableIds, stockIds: ids.length, namedStockEntries: names.length, sources });
    if (missingIds.length || missingTables.length) unresolved.push({ mapId, id: entity.id, missingIds, missingTables });
  }
}
for (const file of [import.meta.filename, "scripts/lib/native-entrance-audit.mjs", "scripts/lib/native-trade-inventory.mjs", "scripts/build-placement-catalog.mjs", "scripts/lib/scene-content-profile.mjs",
  "src/features/map/types.ts", "src/features/map/map-vendor-stock.tsx", "src/features/map/map-location-details.tsx"]) bytes(file);
const report = { kind: "native-trade-inventory-source-and-delta-audit", before, after, stats, additions, unresolved, entranceChanges, recoveredAppearances, unexpectedDeltas, hashes,
  scope: "Exact placed-character trade-table references, catalog stock identities/titles, empty and unresolved pools, unchanged roles/vendor profiles/unrelated content. Display-only changes require exact native portal endpoint, scene, floor and pixel verification. Recovered raw appearances must match an existing complete baseline identity and native object/pivot, but are NOT approved for canonical insertion: routing and connection semantics require separate review. Does not establish runtime trade availability, guarantee any stock or drop, independently prove treasure probabilities, or certify all scene inventories." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats, unresolvedUniqueIds: sorted(unresolved.flatMap(({ missingIds }) => missingIds)), entranceChanges, recoveredAppearances, unexpectedDeltas }, null, 2));
assert.equal(unexpectedDeltas.length, 0, "Unexpected non-inventory changes require separate review");
