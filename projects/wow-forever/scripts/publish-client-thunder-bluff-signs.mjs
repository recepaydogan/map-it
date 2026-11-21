/** Publish positioned Thunder Bluff venue signs and link them to the city. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const family = await readJson("data/client-research/thunder-bluff-sign-family.json");
const serviceSigns = await readJson("data/client-research/published-service-sign-evidence.json");
const cityPath = "public/maps/world-atlas/locations-client.json";
const cityLayer = await readJson(cityPath);
const english = await readJson("src/i18n/locales/en.json");
const city = cityLayer.locations.find(({ id }) => id === family.source.cityLocationId);
const publishedIds = new Set(serviceSigns.markers.map(({ objectId }) => objectId));
if (family.source.build !== serviceSigns.source.build
  || family.source.gameObjects.sha256 !== serviceSigns.source.gameObjects.sha256
  || family.source.cityPoiId !== 29 || city?.nameKey !== "map.publishedPlaces.thunderBluff.name"
  || english.map.publishedPlaces.thunderBluff.name !== "Thunder Bluff"
  || family.signs.length !== 28 || publishedIds.size !== 3
  || ![50492, 148424, 148425].every((id) => publishedIds.has(id))) {
  throw new Error("Thunder Bluff sign family differs from the published city and service signs.");
}
const signs = family.signs.filter(({ objectId }) => !publishedIds.has(objectId));
const locations = signs.map((sign) => {
  const nameKey = `map.thunderBluffSigns.${sign.objectId}`;
  if (english.map.thunderBluffSigns[sign.objectId] !== sign.name
    || !sign.modelNameHints.some((hint) => hint.startsWith("TaurenSign_"))
    || sign.nativePixelAlpha === 0) {
    throw new Error(`Unverified Thunder Bluff sign ${sign.objectId}.`);
  }
  return { id: `client-thunder-bluff-sign-${sign.objectId}`,
    name: "", nameKey, category: "signpost", label: "",
    subtype: "tauren-venue-sign", regionId: "", region: "",
    regionKey: city.nameKey,
    x: sign.atlasPosition.x, y: sign.atlasPosition.y,
    linkedMarkerGroups: [{ titleKey: "map.serviceSigns.nearbyCity",
      links: [{ mapId: "azeroth", markerId: city.id, nameKey: city.nameKey }] }],
  };
});
if (locations.length !== 25) throw new Error("Thunder Bluff sign count changed.");
const newIds = new Set(locations.map(({ id }) => id));
const oldSignposts = city.linkedMarkerGroups?.find(({ titleKey }) =>
  titleKey === "map.places.signposts")?.links ?? [];
city.linkedMarkerGroups = [
  ...(city.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey !== "map.places.signposts"),
  { titleKey: "map.places.signposts", links: [
    ...oldSignposts.filter(({ markerId }) => !newIds.has(markerId)),
    ...locations.map(({ id, nameKey }) => ({ mapId: "azeroth", markerId: id,
      nameKey })),
  ] },
];
await writeFile(join(root, "public/maps/world-atlas/locations-thunder-bluff-signs.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, cityPath), `${JSON.stringify(cityLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-thunder-bluff-sign-evidence.json"),
  `${JSON.stringify({ source: family.source,
    rule: "Twenty-five previously unpublished, source-positioned TaurenSign models lie on opaque native terrain within the verified Thunder Bluff city overlay.",
    caveat: "These are named signs. A sign does not verify a vendor, trainer, NPC, inventory, or service availability.",
    signs: signs.map((sign) => ({ locationId: `client-thunder-bluff-sign-${sign.objectId}`,
      ...sign })) }, null, 2)}\n`);
console.log(`Published ${locations.length} additional Thunder Bluff signs.`);
