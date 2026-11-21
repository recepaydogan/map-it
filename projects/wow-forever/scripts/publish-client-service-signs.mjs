/** Publish placed bank and goods signs without asserting service NPC positions. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const models = await readJson("data/client-research/service-object-models.json");
const places = await readJson("data/client-research/published-marker-evidence.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const placePath = "public/maps/world-atlas/locations-client.json";
const placeLayer = await readJson(placePath);
if (models.source.build !== atlas.source?.build
  || places.source.build !== atlas.source.build) {
  throw new Error("The service signs and world atlas belong to different builds.");
}
const cityEvidence = places.markers.find(({ name }) => name === "Thunder Bluff");
const city = placeLayer.locations.find(({ id }) => id === cityEvidence?.locationId);
if (!city || !cityEvidence?.atlasBounds) {
  throw new Error("Missing verified Thunder Bluff city overlay.");
}
const specs = [
  { objectId: 148424, name: "Kuruk's Goods", model: "TaurenSign_General",
    category: "shop-sign", translation: "map.shopSigns.kuruksGoods" },
  { objectId: 148425, name: "Trade Goods and Supplies", model: "TaurenSign_General",
    category: "shop-sign", translation: "map.shopSigns.tradeGoods" },
  { objectId: 50492, name: "Thunder Bluff Bank", model: "TaurenSign_Bank",
    category: "bank-sign", translation: "map.bankSigns.thunderBluffBank" },
];
const locations = [];
const evidence = [];
for (const spec of specs) {
  const sign = models.records.find(({ objectId }) => objectId === spec.objectId);
  const labels = spec.translation.split(".");
  const localized = labels.reduce((value, key) => value?.[key], english);
  if (!sign || sign.name !== spec.name || sign.mapId !== 1
    || sign.modelSignature !== "MD21"
    || !sign.modelNameHints.includes(spec.model)
    || sign.nearbySettlements[0]?.name !== "Thunder Bluff"
    || sign.nearbySettlements[0]?.worldDistance > 150
    || localized?.name !== sign.name || !localized?.description) {
    throw new Error(`The placed ${spec.name} sign is not corroborated.`);
  }
  const { x, y } = sign.atlasPosition;
  if (x < cityEvidence.atlasBounds.minX || x > cityEvidence.atlasBounds.maxX
    || y < cityEvidence.atlasBounds.minY || y > cityEvidence.atlasBounds.maxY
    || x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
    throw new Error(`The ${spec.name} sign lies outside Thunder Bluff.`);
  }
  const id = `client-service-sign-${sign.objectId}`;
  const location = { id, name: "", nameKey: `${spec.translation}.name`,
    ...(sign.objectId === 148424 ? { aliasIds: ["client-shop-sign-148424"] } : {}),
    category: spec.category, label: "", subtype: spec.category,
    regionId: "", region: "", regionKey: "map.publishedPlaces.thunderBluff.name",
    descriptionKey: `${spec.translation}.description`, x, y,
    linkedMarkerGroups: [{ titleKey: "map.serviceSigns.nearbyCity", links: [{
      mapId: "azeroth", markerId: city.id, nameKey: city.nameKey,
    }] }],
  };
  locations.push(location);
  evidence.push({ locationId: id, objectId: sign.objectId, name: sign.name,
    category: spec.category, displayId: sign.displayId,
    modelFileDataId: sign.modelFileDataId, modelNameHint: spec.model,
    cityLocationId: city.id, atlasPosition: sign.atlasPosition });
}
city.linkedMarkerGroups = [
  ...(city.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    !["map.places.shopSigns", "map.places.bankSigns"].includes(titleKey)),
  ...[
    { category: "shop-sign", titleKey: "map.places.shopSigns" },
    { category: "bank-sign", titleKey: "map.places.bankSigns" },
  ].map(({ category, titleKey }) => ({ titleKey, links: locations
    .filter((location) => location.category === category)
    .map((location) => ({ mapId: "azeroth", markerId: location.id,
      nameKey: location.nameKey })) })),
];
await writeFile(join(root, "public/maps/world-atlas/locations-service-signs.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, placePath), `${JSON.stringify(placeLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-service-sign-evidence.json"),
  `${JSON.stringify({ source: models.source,
    rule: "Exact placed GameObjects use corroborated bank/general-goods sign models inside the named Thunder Bluff overlay.",
    caveat: "These are wayfinding signs; named service NPCs and inventories remain unverified.",
    markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} Thunder Bluff bank and goods signs.`);
