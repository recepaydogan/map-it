/** Publish directional signs and the exact-name place POI they identify. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const models = await readJson("data/client-research/service-object-models.json");
const pois = await readJson("data/client-research/area-poi-category-profile.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
if (models.source.build !== pois.source.build || models.source.build !== atlas.source.build) {
  throw new Error("Wayfinding signs, place POIs, and atlas belong to different builds.");
}

const specs = [
  { name: "Shady Rest Inn", nameKey: "map.wayfinding.shadyRestInn",
    signNameKey: "map.wayfinding.shadyRestInnSign",
    modelHint: "HumanSignPostPointer04", objectIds: [21077, 21080] },
  { name: "Steamwheedle Port", nameKey: "map.wayfinding.steamwheedlePort",
    signNameKey: "map.wayfinding.steamwheedlePortSign",
    modelHint: "WoodSignPointerWorn01", objectIds: [151975, 151979, 151981, 151984] },
];
const placeGroup = pois.groups.find(({ iconId, uiCategory, uiPriority, records }) =>
  iconId === 4 && uiCategory === 0 && uiPriority === 6
  && records.some(({ poiId }) => poiId === 1087));
const place = placeGroup?.records.find(({ poiId }) => poiId === 1087);
if (!place || place.name !== specs[0].name || place.mapId !== 1) {
  throw new Error("The Shady Rest Inn place POI is not corroborated.");
}
const placeId = `client-place-poi-${place.poiId}`;
const signLocations = [];
const signEvidence = [];
for (const spec of specs) {
  const translated = spec.nameKey.split(".").reduce((value, key) => value?.[key], english);
  const signLabel = spec.signNameKey.split(".").reduce((value, key) => value?.[key], english);
  if (translated !== spec.name || signLabel !== `Sign to ${spec.name}`) {
    throw new Error(`Missing directional-sign names for ${spec.name} in en.json.`);
  }
  for (const objectId of spec.objectIds) {
    const sign = models.records.find((record) => record.objectId === objectId);
    if (!sign || sign.name !== spec.name || sign.mapId !== 1
      || sign.modelSignature !== "MD21"
      || !sign.modelNameHints.includes(spec.modelHint)
      || !sign.atlasPosition) {
      throw new Error(`Placed directional sign ${objectId} is not corroborated.`);
    }
    const { x, y } = sign.atlasPosition;
    if (x < atlas.bounds.minX || x > atlas.bounds.maxX
      || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
      throw new Error(`Directional sign ${objectId} lies outside the atlas.`);
    }
    const locationId = `client-wayfinding-sign-${objectId}`;
    signLocations.push({ id: locationId, name: "", nameKey: spec.signNameKey,
      category: "signpost", label: "", subtype: "directional-sign",
      regionId: "", region: "", x, y,
      ...(spec.name === place.name ? { linkedMarkerGroups: [{
        titleKey: "map.wayfinding.namedPlace", links: [{
          mapId: "azeroth", markerId: placeId, nameKey: spec.nameKey,
        }],
      }] } : {}),
    });
    signEvidence.push({ locationId, objectId, name: sign.name, mapId: sign.mapId,
      worldPosition: sign.worldPosition, atlasPosition: sign.atlasPosition,
      displayId: sign.displayId, modelFileDataId: sign.modelFileDataId,
      modelNameHint: spec.modelHint,
      ...(spec.name === place.name ? { exactNameAreaPoiId: place.poiId } : {}),
    });
  }
}
const placeLocation = { id: placeId, name: "", nameKey: specs[0].nameKey,
  category: "point-of-interest", label: "", subtype: "client-area-poi",
  regionId: "", region: "", x: place.atlasPosition.x, y: place.atlasPosition.y,
  linkedMarkerGroups: [{ titleKey: "map.places.signposts",
    links: signLocations.filter(({ id }) => specs[0].objectIds.some((objectId) =>
      id === `client-wayfinding-sign-${objectId}`))
      .map(({ id, nameKey }) => ({ mapId: "azeroth", markerId: id, nameKey })) }],
};
await writeFile(join(root, "public/maps/world-atlas/locations-wayfinding.json"),
  `${JSON.stringify({ locations: [...signLocations, placeLocation] }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-wayfinding-evidence.json"),
  `${JSON.stringify({ source: { product: models.source.product,
    build: models.source.build, gameObjects: models.source.gameObjects,
    displayInfo: models.source.displayInfo, areaPoi: pois.source },
  rule: "Exact named GameObjects with verified directional-sign models yield placed signs. An independent exact-name AreaPOI identifies Shady Rest Inn as a map place and links both ways to its signs.",
  caveat: "The signs and POI do not verify an innkeeper, port service, boat schedule, or building entrance.",
  signs: signEvidence,
  place: { locationId: placeId, poiId: place.poiId, name: place.name,
    mapId: place.mapId, worldPosition: place.worldPosition,
    atlasPosition: place.atlasPosition, iconId: placeGroup.iconId,
    uiCategory: placeGroup.uiCategory, uiPriority: placeGroup.uiPriority },
  }, null, 2)}\n`);
console.log(`Published ${signLocations.length} directional signs and 1 exact-name place POI.`);
