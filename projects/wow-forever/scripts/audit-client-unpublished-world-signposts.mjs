/** Account for world direction pointers that lack a verified published target. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const survey = await readJson("data/client-research/map-placement-survey.json");
const models = await readJson("data/client-research/world-object-model-family.json");
const linked = await readJson("data/client-research/world-signpost-relations.json");
const wayfinding = await readJson("data/client-research/published-wayfinding-evidence.json");
const transport = await readJson("data/client-research/published-transport-sign-evidence.json");
const boats = await readJson("data/client-research/published-boat-sign-evidence.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const places = await readJson("data/client-research/published-point-of-interest-evidence.json");
const instances = await readJson("data/client-research/published-instance-poi-evidence.json");
const flights = await readJson("data/client-research/published-flight-point-evidence.json");
const objectives = await readJson("data/client-research/published-world-objective-evidence.json");
const overlays = await readJson("data/client-research/published-marker-evidence.json");
const build = survey.source.build;
if ([models, linked, wayfinding, transport, boats, settlements, places, instances,
  flights, objectives, overlays].some(({ source }) => source.build !== build)
  || survey.source.tables.find(({ name }) => name === "GameObjects")?.sha256
    !== models.source.gameObjects.sha256
  || linked.source.gameObjects.sha256 !== models.source.gameObjects.sha256) {
  throw new Error("World signpost inventory and published targets use different client data.");
}

const modelsByDisplayId = new Map(models.models.map((model) => [model.displayId, model]));
const pointers = survey.maps.filter(({ mapId }) => mapId === 0 || mapId === 1)
  .flatMap(({ mapId, gameObjects }) => gameObjects.filter((object) => {
    const model = modelsByDisplayId.get(object.displayId);
    return model?.modelMagic === "MD21"
      && model.modelNameHints.some((name) => /sign.*pointer/i.test(name));
  }).map((object) => ({ objectId: object.objectId, name: object.name,
    mapId, worldPosition: object.worldPosition, displayId: object.displayId })));
const byObjectId = new Map(pointers.map((pointer) => [pointer.objectId, pointer]));
if (byObjectId.size !== pointers.length) throw new Error("Duplicate world sign object ID.");

const publishedGroups = [
  { kind: "posted-place", ids: linked.signposts.flatMap(({ members }) =>
    members.map(({ objectId }) => objectId)) },
  { kind: "wayfinding", ids: wayfinding.signs.map(({ objectId }) => objectId) },
  { kind: "transport-sign", ids: transport.signs.map(({ objectId }) => objectId) },
  { kind: "boat-sign", ids: boats.markers.flatMap(({ signObjectIds }) => signObjectIds) },
];
const publishedById = new Map();
for (const group of publishedGroups) {
  for (const objectId of group.ids) {
    if (!byObjectId.has(objectId) || publishedById.has(objectId)) {
      throw new Error(`Published direction sign ${objectId} is missing or duplicated.`);
    }
    publishedById.set(objectId, group.kind);
  }
}
if (publishedGroups[0].ids.length !== linked.nativeTerrainSignCount) {
  throw new Error("Linked signpost count differs from the physical source signs.");
}

const remaining = pointers.filter(({ objectId }) => !publishedById.has(objectId));
const exactMatches = (pointer, records, idKey) => records.filter((record) =>
  record.mapId === pointer.mapId && record.name === pointer.name)
  .map((record) => record[idKey]);
const candidates = remaining.flatMap((pointer) => {
  const placeIds = exactMatches(pointer,
    [...settlements.markers, ...places.markers], "poiId");
  const instanceIds = exactMatches(pointer, instances.markers, "poiId");
  const flightIds = exactMatches(pointer, flights.markers, "taxiNodeId");
  const objectiveIds = exactMatches(pointer, objectives.markers, "representativePoiId");
  const overlayNames = overlays.markers.filter(({ name, sourceIds }) =>
    name === pointer.name && sourceIds.worldMapId === pointer.mapId)
    .map(({ locationId }) => locationId);
  return placeIds.length || instanceIds.length || flightIds.length
    || objectiveIds.length || overlayNames.length
    ? [{ ...pointer, placeIds, instanceIds, flightIds,
      objectiveIds, overlayNames }] : [];
});
const missedTargets = candidates.filter(({ placeIds, instanceIds, objectiveIds, overlayNames }) =>
  placeIds.length || instanceIds.length || objectiveIds.length
  || overlayNames.length);
if (missedTargets.length) {
  throw new Error(`An exact published place, dungeon, or objective sign was missed: ${JSON.stringify(missedTargets)}`);
}
const names = new Map();
for (const pointer of remaining) {
  const key = `${pointer.mapId}:${pointer.name}`;
  const record = names.get(key) ?? { mapId: pointer.mapId,
    name: pointer.name, objectIds: [] };
  record.objectIds.push(pointer.objectId);
  names.set(key, record);
}
const report = {
  source: { product: survey.source.product, build,
    gameObjects: models.source.gameObjects, displayInfo: models.source.displayInfo },
  rule: "World Map 0/1 GameObjects with a client MD21 sign-pointer model are compared against every currently published world direction sign and exact-name positioned place, instance, flight, and objective record.",
  caveat: "An exact name shared with a flight node can describe the wider region. It does not identify a specific taxi master, arrival point, or travel route.",
  pointerCount: pointers.length,
  publishedPointerCount: publishedById.size,
  publishedGroups: publishedGroups.map(({ kind, ids }) => ({ kind, count: ids.length })),
  unpublishedPointerCount: remaining.length,
  unpublishedNameCount: names.size,
  ambiguousTargetCandidates: candidates,
  unpublishedNames: [...names.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.mapId - right.mapId),
};
await writeFile(join(root, "data/client-research/unpublished-world-signpost-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`Audited ${report.pointerCount} world pointers: ${report.publishedPointerCount} published, ${report.unpublishedPointerCount} without a verified target, ${candidates.length} ambiguous exact-name flight candidates.`);
