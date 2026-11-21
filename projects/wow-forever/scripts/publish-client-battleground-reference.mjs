/** Link verified battleground terrain and objective pins into the database. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const links = await readJson("data/client-research/battlemaster-map-links.json");
const english = await readJson("src/i18n/locales/en.json");
const indexPath = "public/data/reference/index.json";
const index = await readJson(indexPath);
const flightPath = "public/data/reference/flight-points/client-taxi-nodes.json";
const flightReferences = await readJson(flightPath);
const maps = [
  { id: "alterac-valley", mapId: 30, wdtId: 790112,
    evidence: "data/client-research/published-alterac-objective-evidence.json",
    graveEvidence: "data/client-research/published-alterac-graveyard-evidence.json",
    flightIds: ["client-taxi-node-59", "client-taxi-node-60"] },
  { id: "warsong-gulch", mapId: 489, wdtId: 790291,
    evidence: "data/client-research/warsong-map-poi-trace.json" },
  { id: "arathi-basin", mapId: 529, wdtId: 790377,
    evidence: "data/client-research/published-arathi-objective-evidence.json" },
  { id: "darkspear-islands", mapId: 2997, wdtId: 7251908,
    evidence: "data/client-research/published-darkspear-objective-evidence.json" },
];
if (links.source.build !== 69977 || index.version !== 1 || flightReferences.version !== 1) {
  throw new Error("Battleground references use incompatible client records.");
}
const sourceRecords = [];
const databaseRecords = [];
for (const map of maps) {
  const name = english.map.battlegroundMaps?.[map.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
  const sourceLink = links.links.find(({ mapId, battlegroundName, mapName }) =>
    mapId === map.mapId && battlegroundName === name && mapName === name);
  const terrain = await readJson(`public/maps/wdt-${map.wdtId}/metadata.json`);
  const evidence = await readJson(map.evidence);
  if (!name || !sourceLink || terrain.source.build !== links.source.build
    || terrain.source.wdtFileDataId !== map.wdtId || terrain.source.tileCount < 1
    || terrain.source.missingFileDataIds.length || evidence.source.build !== links.source.build
    || evidence.source.mapId !== map.mapId || evidence.source.wdtFileDataId !== map.wdtId
    || evidence.source.wdtSha256 !== terrain.source.wdtSha256) {
    throw new Error(`Unverified battleground map ${map.id}.`);
  }
  const referenceId = `client-battleground-map-${map.mapId}`;
  const markerGroups = [];
  const linkedMarkers = [];
  for (const [file, evidenceMarkers, titleKey, names] of [
    ["locations-objectives.json", evidence.markers ?? [], "reference.battlegrounds.objectives",
      english.map.publishedBattlegroundObjectives],
    ["locations-graveyards.json", map.graveEvidence
      ? (await readJson(map.graveEvidence)).markers : [], "reference.battlegrounds.graveyards",
      english.map.publishedGraveyards],
  ]) {
    if (!evidenceMarkers.length) continue;
    const path = `public/maps/wdt-${map.wdtId}/${file}`;
    const layer = await readJson(path);
    if (layer.locations.length !== evidenceMarkers.length) {
      throw new Error(`Battleground pins differ from local evidence: ${map.id}/${file}.`);
    }
    const byId = new Map(evidenceMarkers.map((marker) => [marker.locationId, marker]));
    const groupLinks = layer.locations.map((location) => {
      const source = byId.get(location.id);
      const poiId = Number(location.id.match(/-(\d+)$/)?.[1]);
      if (!source || names?.[poiId] !== source.name || location.nameKey !==
        `map.${file === "locations-graveyards.json" ? "publishedGraveyards" : "publishedBattlegroundObjectives"}.${poiId}`
        || location.reference && (location.reference.category !== "battlegrounds"
          || location.reference.id !== referenceId)) {
        throw new Error(`Unverified battleground pin ${map.id}:${location.id}.`);
      }
      linkedMarkers.push(location.id);
      return { mapId: map.id, markerId: location.id, nameKey: location.nameKey };
    });
    layer.locations = layer.locations.map((location) => ({ ...location,
      reference: { category: "battlegrounds", id: referenceId } }));
    await writeFile(join(root, path), `${JSON.stringify(layer, null, 2)}\n`);
    markerGroups.push({ titleKey, links: groupLinks });
  }
  if (map.mapId === 489 && ((evidence.pois?.length ?? 0) || (evidence.objects?.length ?? 0))) {
    throw new Error("Warsong Gulch has newly positioned records to review.");
  }
  if (map.graveEvidence) {
    const graves = await readJson(map.graveEvidence);
    if (graves.source.build !== links.source.build || graves.source.mapId !== map.mapId
      || graves.source.wdtSha256 !== terrain.source.wdtSha256) {
      throw new Error(`Graveyard evidence differs from ${map.id} terrain.`);
    }
  }
  const flightLinks = (map.flightIds ?? []).map((id) => {
    const flight = flightReferences.entries[id];
    if (!flight || flight.locations.length !== 1 || flight.locations[0].mapId !== map.id) {
      throw new Error(`Unverified battleground flight point ${map.id}:${id}.`);
    }
    flight.sections = flight.sections.filter(({ title }) => title !== "reference.battlegrounds.related");
    flight.sections.push({ title: "reference.battlegrounds.related",
      links: [{ id: referenceId, category: "battlegrounds", name }] });
    return { id, category: "flight-points", name: flight.name, noteKey: flight.subtitleKey };
  });
  const summary = { id: referenceId, category: "battlegrounds", chunk: "client-maps",
    name, icon: "maps/client-icons/tracking/battle-master.png" };
  const entry = { ...summary, mapOverviewId: map.id, facts: [], locations: [],
    sections: flightLinks.length ? [{ title: "reference.battlegrounds.flightPoints",
      links: flightLinks }] : [],
    ...(markerGroups.length ? { mapLinks: markerGroups } : {}),
    source: `BattlemasterListXMap + Map + WDT${linkedMarkers.length ? " + AreaPOI" : ""}, ${links.source.product} build ${links.source.build}` };
  sourceRecords.push({ id: referenceId, mapId: map.id, clientMapId: map.mapId,
    battlemasterListXMapId: sourceLink.id, wdtFileDataId: map.wdtId,
    wdtSha256: terrain.source.wdtSha256, markerIds: linkedMarkers,
    flightIds: map.flightIds ?? [] });
  databaseRecords.push({ summary, entry });
}
const summaries = [...index.entries.filter(({ category }) => category !== "battlegrounds"),
  ...databaseRecords.map(({ summary }) => summary)]
  .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
const counts = new Map();
for (const summary of summaries) counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1);
await mkdir(join(root, "public/data/reference/battlegrounds"), { recursive: true });
await writeFile(join(root, indexPath), `${JSON.stringify({ version: 1,
  categories: [...counts].map(([id, count]) => ({ id, count })), entries: summaries }, null, 2)}\n`);
await writeFile(join(root, "public/data/reference/battlegrounds/client-maps.json"),
  `${JSON.stringify({ version: 1, entries: Object.fromEntries(databaseRecords.map(({ entry }) =>
    [entry.id, entry])) }, null, 2)}\n`);
await writeFile(join(root, flightPath), `${JSON.stringify(flightReferences, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-battleground-reference-evidence.json"),
  `${JSON.stringify({ source: links.source,
    rule: "Only four exact BattlemasterListXMap→Map→local WDT joins with native terrain are listed. Map pins link to their battleground entry; current control and battlemaster NPC locations are not claimed.",
    records: sourceRecords }, null, 2)}\n`);
console.log(`Published ${databaseRecords.length} battlegrounds with ${sourceRecords.reduce((sum, record) =>
  sum + record.markerIds.length, 0)} positioned marker links and two flight-point links.`);
