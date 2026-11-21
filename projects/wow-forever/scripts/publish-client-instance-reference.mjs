/** Publish verified instance POIs as reciprocal map and database records. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const evidence = await readJson("data/client-research/published-instance-poi-evidence.json");
const encounters = await readJson("data/client-research/instance-encounter-trace.json");
const mapLinks = await readJson("data/client-research/published-instance-map-links.json");
const demonFallSign = await readJson("data/client-research/published-demon-fall-sign-evidence.json");
const demonFallSignsPath = "public/maps/wdt-5900942/locations-signs.json";
const demonFallSigns = await readJson(demonFallSignsPath);
const layerPath = "public/maps/world-atlas/locations-instances.json";
const layer = await readJson(layerPath);
const indexPath = "public/data/reference/index.json";
const index = await readJson(indexPath);
const english = await readJson("src/i18n/locales/en.json");
if (evidence.source.build !== mapLinks.source.build || evidence.source.product !== mapLinks.source.product
  || evidence.source.build !== encounters.source.build
  || evidence.source.product !== encounters.source.product
  || index.version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.categories)) {
  throw new Error("Instance references use incompatible source records");
}
const markerById = new Map(evidence.markers.map((marker) => [marker.locationId, marker]));
const encountersByMapId = new Map(encounters.records.map((record) =>
  [record.instanceMapId, record]));
const mapById = new Map(mapLinks.links.map((link) => [link.locationId, link.relatedMapId]));
const demonFallInstance = mapLinks.links.find((link) => link.relatedMapId === "demon-fall-canyon");
const demonFallEntrance = layer.locations.find((location) =>
  location.id === demonFallInstance?.locationId);
const sign = demonFallSigns.locations.find((location) => location.id === demonFallSign.marker.locationId);
if (demonFallSign.source.build !== evidence.source.build
  || demonFallSign.source.product !== evidence.source.product
  || demonFallSign.source.mapId !== demonFallInstance?.instanceMapId
  || demonFallSign.source.wdtFileDataId !== demonFallInstance.wdtFileDataId
  || demonFallSign.source.wdtSha256 !== demonFallInstance.wdtSha256
  || demonFallEntrance?.relatedMapId !== "demon-fall-canyon"
  || demonFallEntrance.nameKey !== "map.publishedInstances.1239.name"
  || !sign || sign.category !== "signpost"
  || sign.x !== demonFallSign.marker.mapPosition.x
  || sign.y !== demonFallSign.marker.mapPosition.y
  || !english.map.places.signposts || !english.map.instanceMaps.worldMap) {
  throw new Error("Demon Fall Canyon sign and dungeon entrance do not share a verified client map.");
}
if (markerById.size !== layer.locations.length) throw new Error("Instance marker evidence and layer counts differ");
const records = layer.locations.map((location) => {
  const source = markerById.get(location.id);
  if (!source || location.category !== "dungeon") throw new Error(`Unverified instance marker ${location.id}`);
  const name = english.map?.publishedInstances?.[source.poiId]?.name;
  const region = location.regionKey ? english.map?.publishedInstances?.[source.poiId]?.region : undefined;
  if (!name || name !== source.name || location.relatedMapId !== mapById.get(location.id)
    || !Number.isInteger(location.instanceFacts?.groupSize)) {
    throw new Error(`Instance ${location.id} lacks a matched name, group size, or terrain relation`);
  }
  const encounterSource = encountersByMapId.get(source.instanceMapId);
  if (!encounterSource || encounterSource.poiId !== source.poiId
    || encounterSource.locationId !== location.id || encounterSource.name !== name
    || !encounterSource.encounters.length) {
    throw new Error(`Instance ${location.id} lacks a verified encounter group.`);
  }
  const instanceEncounters = encounterSource.encounters.map(({ encounterId, name: encounterName }) => {
    const nameKey = `map.instanceEncounters.${encounterId}`;
    if (english.map.instanceEncounters?.[encounterId] !== encounterName) {
      throw new Error(`Add exact DungeonEncounter ${encounterId} name to en.json.`);
    }
    return { id: encounterId, nameKey };
  });
  const { groupSize, minimumEntryLevel } = location.instanceFacts;
  const adventure = { familyId: location.id, kind: groupSize >= 20 ? "raid" : "party",
    faction: "All", level: minimumEntryLevel ?? 0, ...(region ? { region } : {}),
    partySize: groupSize, listed: true };
  const summary = { id: location.id, category: "dungeons", chunk: "client-instances", name,
    ...(location.iconPath ? { icon: location.iconPath } : {}), adventure };
  const entry = { ...summary,
    instanceEncounters,
    ...(location.artworkPath ? { artworkPath: location.artworkPath } : {}),
    facts: [
      { label: "map.instanceFacts.groupSize", value: groupSize },
      ...(minimumEntryLevel !== undefined
        ? [{ label: "map.instanceFacts.minimumEntryLevel", value: minimumEntryLevel }] : []),
    ],
    sections: [],
    locations: [{ mapId: "azeroth", markerId: location.id, name: region ?? name }],
    ...(location.relatedMapId ? { interiorMaps: [{ mapId: location.relatedMapId,
      insetId: "", nameKey: location.nameKey }] } : {}),
    ...(location.id === demonFallInstance.locationId ? { mapLinks: [{
      titleKey: "map.places.signposts", links: [{ mapId: "demon-fall-canyon",
        markerId: sign.id, nameKey: sign.nameKey }],
    }] } : {}),
    source: `AreaPOI + Map + MapDifficulty + DungeonEncounter, ${evidence.source.product} build ${evidence.source.build}`,
  };
  return { location: { ...location, instanceEncounters }, summary, entry };
});
const prior = index.entries.filter((entry) => entry.category !== "dungeons");
const summaries = [...prior, ...records.map(({ summary }) => summary)]
  .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
const counts = new Map();
for (const summary of summaries) counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1);
const categories = [...counts].map(([id, count]) => ({ id, count }));
await mkdir(join(root, "public/data/reference/dungeons"), { recursive: true });
await writeFile(join(root, indexPath), `${JSON.stringify({ version: 1, categories, entries: summaries }, null, 2)}\n`);
await writeFile(join(root, "public/data/reference/dungeons/client-instances.json"),
  `${JSON.stringify({ version: 1, entries: Object.fromEntries(records.map(({ entry }) => [entry.id, entry])) }, null, 2)}\n`);
layer.locations = records.map(({ location }) => ({ ...location,
  reference: { category: "dungeons", id: location.id },
  ...(location.id === demonFallInstance.locationId ? {
    linkedMarkerGroups: [
      ...(location.linkedMarkerGroups ?? []).filter(({ titleKey }) => titleKey !== "map.places.signposts"),
      { titleKey: "map.places.signposts", links: [{ mapId: "demon-fall-canyon",
        markerId: sign.id, nameKey: sign.nameKey }] },
    ],
  } : {}),
}));
await writeFile(join(root, layerPath), `${JSON.stringify(layer, null, 2)}\n`);
sign.reference = { category: "dungeons", id: demonFallInstance.locationId };
sign.linkedMarkerGroups = [
  ...(sign.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    !["map.instanceMaps.entrance", "map.instanceMaps.worldMap"].includes(titleKey)),
  { titleKey: "map.instanceMaps.worldMap", links: [{ mapId: "azeroth",
    markerId: demonFallInstance.locationId,
    nameKey: demonFallEntrance.nameKey }] },
];
await writeFile(join(root, demonFallSignsPath), `${JSON.stringify(demonFallSigns, null, 2)}\n`);
console.log(`Published ${records.length} reciprocal instance database entries`);
