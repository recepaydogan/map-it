/** Publish placed transport signs with only their verified place-name links. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/transport-sign-trace.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const placePath = "public/maps/world-atlas/locations-settlements.json";
const places = await readJson(placePath);
if (trace.source.build !== settlements.source.build
  || trace.source.build !== atlas.source.build) {
  throw new Error("Transport signs, places, and atlas belong to different builds.");
}
const specifications = [
  { objectId: 165549, sourceName: "Maiden's Fancy - Round trips to Booty Bay",
    modelHint: "orcsignpostpointer03", nearbyPoiId: 39, destinationPoiId: 40 },
  { objectId: 165557, sourceName: "Zeppelin Landing Tower",
    modelHint: "orcsignpostpointer03", nearbyPoiId: 33 },
  { objectId: 165558, sourceName: "Zeppelin Landing ",
    modelHint: "StoneSignPointer01", nearbyPoiId: 18 },
];
if (trace.signs.length !== specifications.length) {
  throw new Error("Transport sign candidate count changed.");
}
for (const place of places.locations) {
  place.linkedMarkerGroups = (place.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    !["map.places.transportSigns", "map.places.namedOnTransportSigns"].includes(titleKey));
  if (!place.linkedMarkerGroups.length) delete place.linkedMarkerGroups;
}
const addPlaceLink = (place, titleKey, sign) => {
  place.linkedMarkerGroups = [...(place.linkedMarkerGroups ?? []),
    { titleKey, links: [{ mapId: "azeroth", markerId: sign.id,
      nameKey: sign.nameKey }] }];
};
const locations = [];
const evidence = [];
for (const spec of specifications) {
  const source = trace.signs.find(({ objectId }) => objectId === spec.objectId);
  const nearby = settlements.records.find(({ poiId }) => poiId === spec.nearbyPoiId);
  const nearbyPlace = places.locations.find(({ id }) =>
    id === `client-settlement-poi-${spec.nearbyPoiId}`);
  const destination = spec.destinationPoiId
    ? settlements.records.find(({ poiId }) => poiId === spec.destinationPoiId) : null;
  const destinationPlace = spec.destinationPoiId
    ? places.locations.find(({ id }) =>
      id === `client-settlement-poi-${spec.destinationPoiId}`) : null;
  const translation = english.map.transportSigns[spec.objectId];
  if (!source || source.name !== spec.sourceName
    || source.modelSignature !== "MD21"
    || !source.modelNameHints.includes(spec.modelHint)
    || source.nativePixelAlpha === 0
    || source.nearbySettlements[0]?.poiId !== spec.nearbyPoiId
    || source.nearbySettlements[0].worldDistance > 150
    || nearby?.mapId !== source.mapId || !nearbyPlace
    || english.map.publishedSettlements[spec.nearbyPoiId] !== nearby.name
    || !translation?.name || !translation.description
    || source.atlasPosition.x < atlas.bounds.minX
    || source.atlasPosition.x > atlas.bounds.maxX
    || source.atlasPosition.y < atlas.bounds.minY
    || source.atlasPosition.y > atlas.bounds.maxY) {
    throw new Error(`Unverified transport sign ${spec.objectId}.`);
  }
  if (spec.destinationPoiId && (destination?.name !== "Booty Bay"
    || destinationPlace?.nameKey !== `map.publishedSettlements.${spec.destinationPoiId}`
    || !/round trips to Booty Bay/i.test(source.name))) {
    throw new Error("The Ratchet sign does not establish its posted destination.");
  }
  const id = `client-transport-sign-${spec.objectId}`;
  const nameKey = `map.transportSigns.${spec.objectId}.name`;
  const location = { id, name: "", nameKey, category: "signpost", label: "",
    subtype: "transport-sign", regionId: "", region: "",
    regionKey: nearbyPlace.nameKey,
    descriptionKey: `map.transportSigns.${spec.objectId}.description`,
    x: source.atlasPosition.x, y: source.atlasPosition.y,
    linkedMarkerGroups: [{ titleKey: "map.transportSigns.nearbyPlace", links: [{
      mapId: "azeroth", markerId: nearbyPlace.id, nameKey: nearbyPlace.nameKey,
    }] }, ...(destinationPlace ? [{ titleKey: "map.transportSigns.postedDestination",
      links: [{ mapId: "azeroth", markerId: destinationPlace.id,
        nameKey: destinationPlace.nameKey }] }] : [])],
  };
  locations.push(location);
  addPlaceLink(nearbyPlace, "map.places.transportSigns", location);
  if (destinationPlace) addPlaceLink(destinationPlace,
    "map.places.namedOnTransportSigns", location);
  evidence.push({ ...source, locationId: id, nearbyPlacePoiId: spec.nearbyPoiId,
    destinationPlacePoiId: spec.destinationPoiId ?? null });
}
await writeFile(join(root, "public/maps/world-atlas/locations-transport-signs.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, placePath), `${JSON.stringify(places, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-transport-sign-evidence.json"),
  `${JSON.stringify({ source: trace.source,
    rule: "Three native placed GameObjects use verified signpost models on opaque terrain. Their closest exact-name settlement POIs are within 150 world units. The Ratchet sign itself names Booty Bay.",
    caveat: "The signs do not establish an active boat or zeppelin, timetable, route operation, or boarding point.",
    signs: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} transport signs and reciprocal place links.`);
