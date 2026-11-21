/** Publish grouped dock direction signs with only the relationships the client proves. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const source = await readJson("data/client-research/boat-signs.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
const english = await readJson("src/i18n/locales/en.json");
const settlementPath = "public/maps/world-atlas/locations-settlements.json";
const settlementLayer = await readJson(settlementPath);
if (source.source.build !== atlas.source?.build
  || settlements.source.build !== atlas.source.build) {
  throw new Error("The boat signs and world atlas belong to different builds.");
}
const groups = [
  { id: "auberdine", townPoiId: 798, mapId: 1,
    signNames: ["Boat to Menethil", "Boat to Teldrassil", "Boat to Stormwind"],
    destinationPlaces: [
      { signName: "Boat to Menethil", placePoiId: 11 },
      { signName: "Boat to Stormwind", placePoiId: 16 },
    ] },
  { id: "menethil-harbor", townPoiId: 11, mapId: 0,
    signNames: ["Boat to Theramore", "Boat to Auberdine"],
    destinationPlaces: [
      { signName: "Boat to Theramore", placePoiId: 791 },
      { signName: "Boat to Auberdine", placePoiId: 798 },
    ] },
];
const translations = {
  auberdine: "auberdine",
  "menethil-harbor": "menethilHarbor",
};
const locations = [];
const evidence = [];
for (const place of settlementLayer.locations) {
  place.linkedMarkerGroups = (place.linkedMarkerGroups ?? [])
    .filter(({ titleKey }) => titleKey !== "map.places.namedOnBoatSigns");
  if (!place.linkedMarkerGroups.length) delete place.linkedMarkerGroups;
}
for (const group of groups) {
  const town = settlements.records.find(({ poiId }) => poiId === group.townPoiId);
  const place = settlementLayer.locations.find(({ id }) =>
    id === `client-settlement-poi-${group.townPoiId}`);
  if (!town || !place || town.mapId !== group.mapId) {
    throw new Error(`Missing source-backed settlement for ${group.id}.`);
  }
  const signs = source.signs.filter(({ mapId, nearestSettlements }) =>
    mapId === group.mapId && nearestSettlements[0]?.poiId === group.townPoiId);
  const names = signs.map(({ name }) => name).sort();
  if (names.join("|") !== [...group.signNames].sort().join("|")
    || signs.some(({ modelStrings, nearestSettlements }) =>
      !modelStrings.some((value) => /SignPostPointer/.test(value))
      || nearestSettlements[0].worldDistance > 450)) {
    throw new Error(`Boat sign identities or models changed at ${group.id}.`);
  }
  const translation = translations[group.id];
  if (!english.map?.boatSigns?.[translation]?.name
    || !english.map?.boatSigns?.[translation]?.description
    || english.map.publishedSettlements[group.townPoiId] !== town.name) {
    throw new Error(`Missing verified boat sign or town translations for ${group.id}.`);
  }
  const x = signs.reduce((sum, sign) => sum + sign.atlasPosition.x, 0) / signs.length;
  const y = signs.reduce((sum, sign) => sum + sign.atlasPosition.y, 0) / signs.length;
  if (x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
    throw new Error(`Boat sign group ${group.id} lies outside the atlas.`);
  }
  const id = `client-boat-signs-${group.id}`;
  const destinationLinks = group.destinationPlaces.map(({ signName, placePoiId }) => {
    const sign = signs.find(({ name }) => name === signName);
    const target = settlements.records.find(({ poiId }) => poiId === placePoiId);
    const targetPlace = settlementLayer.locations.find(({ id: locationId }) =>
      locationId === `client-settlement-poi-${placePoiId}`);
    if (!sign || !target || !targetPlace
      || !signName.startsWith("Boat to ")
      || !target.name.startsWith(signName.slice("Boat to ".length))
      || english.map.publishedSettlements[placePoiId] !== target.name) {
      throw new Error(`Unverified posted destination ${signName}.`);
    }
    const backLinks = targetPlace.linkedMarkerGroups ?? [];
    const backGroup = backLinks.find(({ titleKey }) => titleKey === "map.places.namedOnBoatSigns")
      ?? { titleKey: "map.places.namedOnBoatSigns", links: [] };
    if (!backLinks.includes(backGroup)) backLinks.push(backGroup);
    backGroup.links.push({ mapId: "azeroth", markerId: id,
      nameKey: `map.boatSigns.${translation}.name` });
    targetPlace.linkedMarkerGroups = backLinks;
    return { mapId: "azeroth", markerId: targetPlace.id,
      nameKey: `map.publishedSettlements.${placePoiId}`,
      signObjectId: sign.objectId, signName };
  });
  locations.push({ id, name: "", nameKey: `map.boatSigns.${translation}.name`,
    category: "signpost", label: "", subtype: "dock-signs",
    regionId: "", region: "", regionKey: `map.publishedSettlements.${group.townPoiId}`,
    descriptionKey: `map.boatSigns.${translation}.description`, x, y,
    linkedMarkerGroups: [{ titleKey: "map.boatSigns.nearbyTown", links: [{
      mapId: "azeroth", markerId: place.id,
      nameKey: `map.publishedSettlements.${group.townPoiId}`,
    }] }, { titleKey: "map.boatSigns.postedDestinations",
      links: destinationLinks.map(({ mapId, markerId, nameKey }) => ({
        mapId, markerId, nameKey })) }],
  });
  place.linkedMarkerGroups = [
    ...(place.linkedMarkerGroups ?? []).filter(({ titleKey }) => titleKey !== "map.places.boatSigns"),
    { titleKey: "map.places.boatSigns", links: [{
      mapId: "azeroth", markerId: id,
      nameKey: `map.boatSigns.${translation}.name`,
    }] },
  ];
  evidence.push({ locationId: id, nearbyTown: town.name, townPoiId: group.townPoiId,
    signObjectIds: signs.map(({ objectId }) => objectId),
    names: signs.map(({ name }) => name),
    postedDestinationPlaceLinks: destinationLinks.map(({ signObjectId, signName, markerId }) => ({
      signObjectId, signName, townLocationId: markerId })),
    modelFileDataIds: [...new Set(signs.map(({ modelFileDataId }) => modelFileDataId))],
    atlasPosition: { x, y } });
}
await writeFile(join(root, "public/maps/world-atlas/locations-boats.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, settlementPath), `${JSON.stringify(settlementLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-boat-sign-evidence.json"),
  `${JSON.stringify({ source: source.source,
    rule: "Group colocated named GameObjects whose display models contain SignPostPointer; anchor at the mean of their placed coordinates. Link to the nearby town and to published place POIs whose names begin with a posted 'Boat to' destination.",
    caveat: "These markers locate direction signs. Boat service, timetable, destination landing, and boarding position remain unverified.",
    markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} grouped boat sign markers from ${source.signs.length} placed signs.`);
