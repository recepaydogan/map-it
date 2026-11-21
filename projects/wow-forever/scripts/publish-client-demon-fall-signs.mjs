/** Publish the four source-verified Demon Fall Canyon signs as one marker. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const survey = await readJson("data/client-research/map-placement-survey.json");
const models = await readJson("data/client-research/map-object-models.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const terrain = await readJson("public/maps/wdt-5900942/metadata.json");
const settlementEvidence = await readJson("data/client-research/published-settlement-poi-evidence.json");
const settlementPath = "public/maps/world-atlas/locations-settlements.json";
const settlementLayer = await readJson(settlementPath);
const english = await readJson("src/i18n/locales/en.json");
const map = survey.maps.find(({ mapId }) => mapId === 2784);
const identity = identities.records.find(({ wdtFileDataId }) => wdtFileDataId === 5900942);
const model = models.records.find(({ displayId }) => displayId === 386);
const gameObjects = survey.source.tables.find(({ name }) => name === "GameObjects");
const expectedNames = ["Azshara", "The Barrens", "Astranaar", "Felwood"];
if (survey.source.build !== terrain.source.build || models.source.build !== terrain.source.build
  || identities.source.build !== terrain.source.build
  || settlementEvidence.source.build !== terrain.source.build
  || map?.name !== "Demon Fall Canyon" || map.wdtFileDataId !== 5900942
  || map.areaPois.length !== 0 || map.gameObjects.length !== 4
  || identity?.maps.length !== 1 || identity.maps[0].mapId !== 2784
  || identity.maps[0].name !== map.name || identity.tileCount !== terrain.source.tileCount
  || terrain.source.wdtFileDataId !== 5900942 || terrain.source.missingFileDataIds.length
  || !model || !model.modelNameHints.some((hint) => hint.includes("NightElfSignPostPointer"))
  || !gameObjects || !english.map.directionalSigns?.demonFallCanyon) {
  throw new Error("Demon Fall Canyon sign sources or native terrain changed.");
}
const objects = [...map.gameObjects].sort((left, right) => left.objectId - right.objectId);
if (objects.some(({ displayId }) => displayId !== 386)
  || [...new Set(objects.map(({ name }) => name))].sort().join("|")
    !== [...expectedNames].sort().join("|")
  || objects.some(({ worldPosition }) => Math.hypot(
    worldPosition[0] - objects[0].worldPosition[0],
    worldPosition[1] - objects[0].worldPosition[1]) >= 1)
  || expectedNames.some((name) => !english.map.directionalSigns.demonFallCanyon.includes(name))) {
  throw new Error("Demon Fall Canyon objects no longer form one directional signpost.");
}
const x = objects.reduce((sum, object) => sum + object.mapPosition.x, 0) / objects.length;
const y = objects.reduce((sum, object) => sum + object.mapPosition.y, 0) / objects.length;
const tileX = Math.floor(x / terrain.tileSize);
const tileY = Math.floor(y / terrain.tileSize);
const tileKey = `${tileX},${tileY}`;
if (!terrain.tileCoverage[0].includes(tileKey)) throw new Error("Signpost lacks native terrain.");
const pixel = await sharp(join(root, "public/maps/wdt-5900942/tiles/0",
  `tile${tileX}x${tileY}.webp`)).ensureAlpha().extract({
  left: Math.floor(x - tileX * terrain.tileSize),
  top: Math.floor(y - tileY * terrain.tileSize), width: 1, height: 1,
}).raw().toBuffer();
if (pixel[3] === 0) throw new Error("Signpost lies on transparent terrain.");
const locationId = `client-demon-fall-signpost-${objects[0].objectId}`;
const signedObject = objects.find(({ name }) => name === "Astranaar");
const signedPlace = settlementEvidence.markers.find(({ poiId }) => poiId === 42);
const placeMarker = settlementLayer.locations.find(({ id }) =>
  id === "client-settlement-poi-42");
if (!signedObject || signedPlace?.name !== signedObject.name || signedPlace.mapId !== 1
  || placeMarker?.nameKey !== "map.publishedSettlements.42"
  || english.map.publishedSettlements[42] !== signedObject.name
  || !english.map.directionalSigns.signedPlaces) {
  throw new Error("The Astranaar sign label does not match a verified client town POI.");
}
const signedPlaceLink = { mapId: "azeroth", markerId: placeMarker.id,
  nameKey: placeMarker.nameKey };
const backGroup = placeMarker.linkedMarkerGroups?.find(({ titleKey }) =>
  titleKey === "map.places.signposts")
  ?? { titleKey: "map.places.signposts", links: [] };
backGroup.links = backGroup.links.filter(({ mapId, markerId }) =>
  mapId !== "demon-fall-canyon" || markerId !== locationId);
backGroup.links.push({ mapId: "demon-fall-canyon", markerId: locationId,
  nameKey: "map.directionalSigns.name" });
placeMarker.linkedMarkerGroups = [
  ...(placeMarker.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey !== "map.places.signposts"), backGroup,
];
await writeFile(join(root, "public/maps/wdt-5900942/locations-signs.json"),
  `${JSON.stringify({ locations: [{ id: locationId, name: "",
    nameKey: "map.directionalSigns.name", category: "signpost", label: "",
    subtype: "client-direction-sign", regionId: "", region: "",
    regionKey: "map.instanceMaps.demonFallCanyon",
    descriptionKey: "map.directionalSigns.demonFallCanyon", x, y,
    linkedMarkerGroups: [{ titleKey: "map.directionalSigns.signedPlaces",
      links: [signedPlaceLink] }] }] }, null, 2)}\n`);
await writeFile(join(root, settlementPath),
  `${JSON.stringify(settlementLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-demon-fall-sign-evidence.json"),
  `${JSON.stringify({ source: { product: terrain.source.product, build: terrain.source.build,
    mapId: 2784, wdtFileDataId: 5900942, wdtSha256: terrain.source.wdtSha256,
    gameObjects, displayInfo: models.source.displayInfo },
  selectionRule: "Four named GameObjects use NightElfSignPostPointer01 DisplayID 386 and share one position within one world unit.",
  caveat: "Posted place names identify directions, not destination coordinates or an active travel service.",
  marker: { locationId, objectIds: objects.map(({ objectId }) => objectId),
    postedNames: objects.map(({ name }) => name), displayId: 386,
    postedPlaceLink: { signObjectId: signedObject.objectId,
      townPoiId: signedPlace.poiId, townLocationId: placeMarker.id },
    modelFileDataId: model.modelFileDataId, modelSha256: model.modelSha256,
    mapPosition: { x, y }, nativeTile: tileKey, nativePixelAlpha: pixel[3] } }, null, 2)}\n`);
console.log(`Published one Demon Fall Canyon signpost from ${objects.length} placed signs.`);
