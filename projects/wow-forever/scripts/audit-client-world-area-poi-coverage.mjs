/** Account for every named AreaPOI on the two native world-map continents. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const [profile, overlay, settlements, instances, generic, objectives, wayfinding] =
  await Promise.all([
    "area-poi-category-profile.json", "published-marker-evidence.json",
    "published-settlement-poi-evidence.json", "published-instance-poi-evidence.json",
    "published-point-of-interest-evidence.json", "published-world-objective-evidence.json",
    "published-wayfinding-evidence.json",
  ].map((name) => readJson(`data/client-research/${name}`)));
const build = profile.source.build;
for (const evidence of [overlay, settlements, instances, generic, objectives, wayfinding]) {
  if (evidence.source.build !== build) {
    throw new Error("World AreaPOI evidence belongs to different client builds.");
  }
}
const sourceRows = profile.groups.flatMap(({ iconId, uiCategory, uiPriority, records }) =>
  records.filter(({ mapId }) => [0, 1].includes(mapId))
    .map((row) => ({ ...row, iconId, uiCategory, uiPriority })));
const sourceById = new Map(sourceRows.map((row) => [row.poiId, row]));
if (sourceById.size !== sourceRows.length || sourceRows.length !== 267) {
  throw new Error("Named world AreaPOI count or IDs changed.");
}
const published = new Map();
const claim = (poiId, family) => {
  if (!sourceById.has(poiId) || published.has(poiId)) {
    throw new Error(`Invalid or multiply published AreaPOI ${poiId}.`);
  }
  published.set(poiId, family);
};
for (const marker of overlay.markers) claim(marker.sourceIds.areaPoiId, "city-town-overlay");
for (const marker of settlements.markers) claim(marker.poiId, "city-town-poi");
for (const marker of instances.markers) claim(marker.poiId, "instance-poi");
for (const marker of generic.markers) claim(marker.poiId, "named-place-poi");
for (const marker of objectives.markers) {
  for (const poiId of marker.sourcePoiIds) claim(poiId, "world-objective-state");
}
claim(wayfinding.place.poiId, "wayfinding-place");
const duplicate = generic.excludedSpecificPlaceDuplicates;
if (duplicate.length !== 1 || duplicate[0].poiId !== 907
  || duplicate[0].name !== "Aldrassil"
  || duplicate[0].specificLocationId !== "client-settlement-poi-36"
  || sourceById.get(907)?.name !== "Aldrassil"
  || !settlements.markers.some(({ poiId, name }) => poiId === 36 && name === "Aldrassil")) {
  throw new Error("The excluded Aldrassil POI is not a verified duplicate.");
}
const stateWarnings = [
  ...[1696, 1697, 1698, 1699, 1700, 1701].map((poiId) => ({
    poiId, name: "Under Attack", iconId: 152, uiCategory: 3, uiPriority: 41,
  })),
  ...[1724, 1725, 1726, 1727].map((poiId) => ({
    poiId, name: "Sandworm!", iconId: 134, uiCategory: 0, uiPriority: 42,
  })),
];
for (const warning of stateWarnings) {
  const source = sourceById.get(warning.poiId);
  if (!source || published.has(warning.poiId)
    || Object.entries(warning).some(([key, value]) => source[key] !== value)) {
    throw new Error(`Unverified warning-state AreaPOI ${warning.poiId}.`);
  }
}
const excludedIds = new Set([duplicate[0].poiId,
  ...stateWarnings.map(({ poiId }) => poiId)]);
const unclassified = sourceRows.filter(({ poiId }) =>
  !published.has(poiId) && !excludedIds.has(poiId));
if (unclassified.length || published.size + excludedIds.size !== sourceRows.length) {
  throw new Error(`Unclassified named world AreaPOIs: ${JSON.stringify(unclassified)}.`);
}
const publishedByFamily = Object.fromEntries([...new Set(published.values())]
  .map((family) => [family, [...published.values()].filter((value) => value === family).length]));
await writeFile(join(root, "data/client-research/world-area-poi-coverage-audit.json"),
  `${JSON.stringify({ source: { product: profile.source.product, build,
    areaPoi: { fileDataId: profile.source.fileDataId, sha256: profile.source.sha256 } },
  totalNamedWorldAreaPois: sourceRows.length, representedAreaPois: published.size,
  publishedByFamily, excludedDuplicate: duplicate[0],
  unpublishedStateWarnings: stateWarnings,
  unclassified,
  rule: "Every named Map 0/1 AreaPOI is represented by a source-backed published marker, excluded as an exact duplicate, or held as an alert whose active state the static client cannot establish." }, null, 2)}\n`);
console.log(`Accounted for ${sourceRows.length} named world AreaPOIs: `
  + `${published.size} represented, ${duplicate.length} duplicate, `
  + `${stateWarnings.length} unverified warning states.`);
