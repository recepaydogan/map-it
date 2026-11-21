/** Add public instance locations after the six strictly matched client POIs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await readJson("data/client-research/mapgenie-instance-source.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const clientInstances = await readJson("data/client-research/published-instance-poi-evidence.json");
const razorfen = await readJson("data/client-research/published-razorfen-map-evidence.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const layerPath = "public/maps/world-atlas/locations-instances.json";
const indexPath = "public/data/reference/index.json";
const chunkPath = "public/data/reference/dungeons/client-instances.json";
const searchPath = "public/data/map-search/index.json";
const layer = await readJson(layerPath);
const index = await readJson(indexPath);
const chunk = await readJson(chunkPath);
const search = await readJson(searchPath);
if (source.source?.mapId !== 1027 || source.source?.instanceCategoryId !== 27625
  || !Array.isArray(source.instances) || source.instances.length < 29
  || !Array.isArray(source.calibrationPlaces)
  || settlements.source.build !== atlas.source?.build
  || clientInstances.source.build !== atlas.source.build
  || razorfen.source.build !== atlas.source.build
  || razorfen.source.mapId !== 47 || razorfen.source.name !== "Razorfen Kraul"
  || !Array.isArray(layer.locations) || !Array.isArray(index.entries)
  || !chunk.entries || typeof chunk.entries !== "object") {
  throw new Error("Instance coverage source or client build is incompatible.");
}

const clientIds = new Set(clientInstances.markers.map(({ locationId }) => locationId));
const clientLocations = layer.locations.filter(({ id }) => clientIds.has(id));
if (clientLocations.length !== clientIds.size) throw new Error("Missing client instance marker.");
const clientSummaries = index.entries.filter(({ id }) => clientIds.has(id));
if (clientSummaries.length !== clientIds.size) throw new Error("Missing client instance summary.");
const clientEntries = clientInstances.markers.map(({ locationId }) => chunk.entries[locationId]);
if (clientEntries.some((entry) => !entry)) throw new Error("Missing client instance reference.");

const byPlaceName = new Map();
for (const place of source.calibrationPlaces) {
  const matches = byPlaceName.get(place.title) ?? [];
  matches.push(place);
  byPlaceName.set(place.title, matches);
}
const anchorsByMap = new Map([[0, []], [1, []]]);
for (const place of settlements.markers) {
  const matches = byPlaceName.get(place.name);
  if (matches?.length !== 1 || !anchorsByMap.has(place.mapId)) continue;
  anchorsByMap.get(place.mapId).push({
    name: place.name, mapgenieId: matches[0].id,
    latitude: matches[0].latitude, longitude: matches[0].longitude,
    x: place.atlasPosition.x, y: place.atlasPosition.y,
  });
}
const lineFit = (records, input, output) => {
  const inputMean = records.reduce((sum, record) => sum + record[input], 0) / records.length;
  const outputMean = records.reduce((sum, record) => sum + record[output], 0) / records.length;
  const slope = records.reduce((sum, record) =>
    sum + (record[input] - inputMean) * (record[output] - outputMean), 0)
    / records.reduce((sum, record) => sum + (record[input] - inputMean) ** 2, 0);
  return { slope, intercept: outputMean - slope * inputMean };
};
const calibrations = [...anchorsByMap].map(([mapId, anchors]) => {
  if (anchors.length < 20) throw new Error(`Insufficient MapGenie calibration for Map ${mapId}.`);
  const x = lineFit(anchors, "longitude", "x");
  const y = lineFit(anchors, "latitude", "y");
  const errors = anchors.map((anchor) => Math.hypot(
    anchor.x - (x.slope * anchor.longitude + x.intercept),
    anchor.y - (y.slope * anchor.latitude + y.intercept)));
  const maximumError = Math.max(...errors);
  if (maximumError > 0.2) throw new Error(`MapGenie projection drift on Map ${mapId}: ${maximumError}.`);
  return { mapId, anchorCount: anchors.length, x, y,
    maximumError, meanError: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    anchorIds: anchors.map(({ mapgenieId }) => mapgenieId),
    longitudeRange: [Math.min(...anchors.map(({ longitude }) => longitude)),
      Math.max(...anchors.map(({ longitude }) => longitude))],
  };
});
const project = (record) => {
  const ranked = calibrations.map((calibration) => ({ calibration,
    gap: record.longitude < calibration.longitudeRange[0]
      ? calibration.longitudeRange[0] - record.longitude
      : Math.max(0, record.longitude - calibration.longitudeRange[1]),
  })).sort((left, right) => left.gap - right.gap);
  if (ranked[0].gap > 0.08 || ranked[0].gap === ranked[1].gap) {
    throw new Error(`Ambiguous continent for MapGenie instance ${record.title}.`);
  }
  const { calibration } = ranked[0];
  const x = calibration.x.slope * record.longitude + calibration.x.intercept;
  const y = calibration.y.slope * record.latitude + calibration.y.intercept;
  if (x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
    throw new Error(`MapGenie instance ${record.title} projects outside the atlas.`);
  }
  return { mapId: calibration.mapId, x, y };
};

const clientByName = new Map(clientInstances.markers.map((marker) => [marker.name, marker]));
const betaUpdateSource = "https://us.forums.blizzard.com/en/wow/t/2360696";
const betaDungeonLevels = new Map([
  ["Excavation Site", "26–31"],
  ["Razorfen Downs", "25+"],
  ["Uldaman", "30+"],
]);
const existingLocationById = new Map(layer.locations.map((location) => [location.id, location]));
const locationById = new Map(clientLocations.map((location) => [location.id, location]));
const summaryById = new Map(clientSummaries.map((summary) => [summary.id, summary]));
const entryById = new Map(clientEntries.map((entry) => [entry.id, entry]));
const projected = [];
const seenNames = new Set();
for (const record of source.instances) {
  if (seenNames.has(record.title) || !["dungeon", "raid"].includes(record.kind)) {
    throw new Error(`Duplicate or invalid MapGenie instance ${record.title}.`);
  }
  seenNames.add(record.title);
  const position = project(record);
  const client = clientByName.get(record.title);
  const id = client?.locationId ?? `mapgenie-instance-${record.id}`;
  const nameKey = client ? `map.publishedInstances.${client.poiId}.name`
    : `map.instanceCoverage.names.${record.id}`;
  if (nameKey.split(".").reduce((value, part) => value?.[part], english) !== record.title) {
    throw new Error(`Add ${record.title} to the English instance catalog.`);
  }
  const common = {
    x: position.x, y: position.y,
    detailLabelKey: record.kind === "raid"
      ? "map.instanceCoverage.raid" : "map.instanceCoverage.dungeon",
  };
  const betaLevelRange = betaDungeonLevels.get(record.title);
  const betaFacts = betaLevelRange ? [
    { label: "map.instanceFacts.betaAvailable", value: true },
    { label: "map.instanceFacts.betaLevelRange", value: betaLevelRange },
  ] : [];
  if (client) {
    const previous = locationById.get(id);
    locationById.set(id, { ...previous, ...common, category: record.kind,
      ...(betaLevelRange ? { instanceFacts: { ...previous.instanceFacts,
        betaAvailable: true, betaLevelRange } } : {}),
    });
    const entry = entryById.get(id);
    entryById.set(id, { ...entry,
      facts: [...entry.facts.filter(({ label }) => label !== "map.instanceCoverage.positionSource"
        && !["map.instanceFacts.betaAvailable", "map.instanceFacts.betaLevelRange"].includes(label)),
      ...betaFacts],
      source: `${entry.source.split("; MapGenie location")[0]}; MapGenie location ${record.id}`
        + (betaLevelRange ? `; beta availability and ${betaLevelRange} range: ${betaUpdateSource}` : ""),
    });
  } else {
    const previous = existingLocationById.get(id);
    const location = { id, name: "", nameKey, category: record.kind, label: "",
      subtype: "instance", regionId: "", region: "", x: common.x, y: common.y,
      ...(english.map.mapgenieCommunity?.[record.id]?.description
        ? { descriptionKey: `map.mapgenieCommunity.${record.id}.description` } : {}),
      detailLabelKey: common.detailLabelKey,
      reference: { category: "dungeons", id },
      ...(record.title === "Razorfen Kraul" ? { relatedMapId: "razorfen-kraul" } : {}),
      ...(previous?.instanceFacts ? { instanceFacts: previous.instanceFacts } : {}),
      ...(betaLevelRange ? { instanceFacts: { ...previous?.instanceFacts,
        betaAvailable: true, betaLevelRange } } : {}),
    };
    const adventure = { familyId: id, kind: record.kind === "raid" ? "raid" : "party",
      faction: "All", level: 0, listed: true };
    const summary = { id, category: "dungeons", chunk: "client-instances",
      name: record.title, adventure };
    const entry = { ...summary,
      facts: betaFacts,
      sections: [], locations: [{ mapId: "azeroth", markerId: id, name: record.title }],
      ...(record.title === "Razorfen Kraul" ? { interiorMaps: [{ mapId: "razorfen-kraul",
        insetId: "", nameKey: "map.instanceMaps.razorfenKraul" }] } : {}),
      source: betaLevelRange
        ? `MapGenie Azeroth location ${record.id}; client entrance unverified; beta availability and ${betaLevelRange} range: ${betaUpdateSource}`
        : `MapGenie Azeroth location ${record.id}; client entrance and availability unverified`,
    };
    locationById.set(id, location);
    summaryById.set(id, summary);
    entryById.set(id, entry);
  }
  projected.push({ id, mapgenieId: record.id, name: record.title, kind: record.kind,
    clientPoiId: client?.poiId ?? null, mapId: position.mapId,
    mapgenieCoordinates: { latitude: record.latitude, longitude: record.longitude },
    atlasPosition: { x: position.x, y: position.y } });
}

const locations = [...locationById.values()].sort((left, right) =>
  left.nameKey.localeCompare(right.nameKey));
for (const location of locations.filter(({ instanceFacts }) => instanceFacts?.betaAvailable)) {
  const matches = search.locations.filter(({ point }) => point.id === location.id);
  if (matches.length !== 1) throw new Error(`Missing search result for ${location.id}.`);
  matches[0].point.instanceFacts = location.instanceFacts;
}
const summaries = [...index.entries.filter(({ category }) => category !== "dungeons"),
  ...summaryById.values()].sort((left, right) =>
  left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
const counts = new Map();
for (const summary of summaries) counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1);
const categories = [...counts].map(([id, count]) => ({ id, count }));
await writeFile(join(root, layerPath), `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, indexPath),
  `${JSON.stringify({ version: 1, categories, entries: summaries }, null, 2)}\n`);
await writeFile(join(root, chunkPath),
  `${JSON.stringify({ version: 1, entries: Object.fromEntries([...entryById]
    .sort(([left], [right]) => left.localeCompare(right))) }, null, 2)}\n`);
await writeFile(join(root, searchPath), `${JSON.stringify(search, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-instance-coverage-evidence.json"),
  `${JSON.stringify({ source: source.source, clientBuild: atlas.source.build,
    rule: "MapGenie coordinates are projected onto each native continent using exact-name city and town anchors. These positions are external map locations, not verified client entrances.",
    betaAvailabilitySource: betaUpdateSource,
    betaDungeonLevels: Object.fromEntries(betaDungeonLevels),
    calibration: calibrations,
    counts: { mapgenie: projected.length,
      clientAndMapgenie: projected.filter(({ clientPoiId }) => clientPoiId !== null).length,
      mapgenieOnly: projected.filter(({ clientPoiId }) => clientPoiId === null).length,
      clientOnly: clientIds.size - projected.filter(({ clientPoiId }) => clientPoiId !== null).length,
      published: locations.length },
    locations: projected }, null, 2)}\n`);
console.log(`Published ${locations.length} instances (${projected.length} MapGenie locations, ${clientIds.size} client POIs).`);
