/** Project reported quest NPC zone coordinates onto the client world atlas. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const observed = await readJson("public/data/dungeons/observed-quests.json");
const search = await readJson("public/data/map-search/index.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const english = await readJson("src/i18n/locales/en.json");
const layerPath = "public/maps/world-atlas/locations-quest-npcs.json";
const zoneByPlace = {
  "Sentinel Tower": "Westfall",
  "Darkshire Town Hall": "Duskwood",
};
const existingNpcCategories = new Set([
  "profession-trainer", "merchant", "repair-vendor", "flight-master",
  "auctioneer", "banker", "stable-master", "innkeeper", "battlemaster", "transmogrifier",
]);
const existingNames = new Set(search.locations.filter(({ point }) =>
  existingNpcCategories.has(point.category)).map(({ point }) => point.name.toLocaleLowerCase("en")));
const slug = (name) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const reports = new Map();
for (const quest of observed.quests) {
  for (const role of ["giver", "turnIn"]) {
    const npc = quest[role];
    if (!npc?.name || !npc.where || npc.name.startsWith("Creature #")
      || existingNames.has(npc.name.toLocaleLowerCase("en"))) continue;
    const match = /^(.*?)\s*\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)$/.exec(npc.where);
    if (!match || !quest.dungeonId) continue;
    const [, region, xText, yText] = match;
    const x = Number(xText), y = Number(yText);
    if (x < 0 || x > 100 || y < 0 || y > 100) throw new Error(`Invalid NPC coordinates: ${npc.name}`);
    const previous = reports.get(npc.name);
    if (previous && (previous.region !== region || previous.x !== x || previous.y !== y)) {
      throw new Error(`Conflicting NPC coordinates: ${npc.name}`);
    }
    reports.set(npc.name, { name: npc.name, region, x, y,
      dungeonIds: new Set([...(previous?.dungeonIds ?? []), quest.dungeonId]) });
  }
}
if (observed.version !== 1 || reports.size !== 28) {
  throw new Error(`Unexpected observed NPC source: ${reports.size} named locations`);
}

const unpackFloats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Expected packed UiMapAssignment floats.");
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const openTable = (storage, name) => {
  const record = catalog.identified.find((entry) => entry.name === name);
  if (!record) throw new Error(`Missing client table ${name}`);
  const file = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader } = readLocalWdc5(storage.readFile(file));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed in the installed client`);
  }
  return reader;
};
const sameFloats = (first, second) => first.length === second.length
  && first.every((number, index) => Math.abs(number - second[index]) < 0.0001);
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const uiMaps = openTable(storage, "UiMap");
  const assignments = openTable(storage, "UiMapAssignment");
  const names = new Map(uiMaps.getAllIDs().map((id) => [uiMaps.getRowData(id)?.[0]?.string, id]));
  const byUiMap = new Map();
  for (const id of assignments.getAllIDs()) {
    const uiMapId = assignments.getRowRelationship(id);
    const row = assignments.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const existing = byUiMap.get(uiMapId) ?? [];
    existing.push({ mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6),
      uiMin: unpackFloats(row[0].data, 2), uiMax: unpackFloats(row[1].data, 2) });
    byUiMap.set(uiMapId, existing);
  }
  for (const world of atlas.terrainLayers.filter((layer) => [0, 1].includes(layer.source?.mapId))) {
    const current = (byUiMap.get(947) ?? []).find(({ mapId }) => mapId === world.source.mapId);
    if (!current || !sameFloats(current.worldRegion, world.source.worldRegion)
      || !sameFloats(current.uiMin, world.source.uiMin)
      || !sameFloats(current.uiMax, world.source.uiMax)) {
      throw new Error(`Current client world assignment differs from atlas map ${world.source.mapId}`);
    }
  }
  const project = createClientWorldProjector(atlas);
  const position = (zone, x, y) => {
    const uiMapId = names.get(zone);
    const matches = byUiMap.get(uiMapId) ?? [];
    if (matches.length !== 1 || ![0, 1].includes(matches[0].mapId)) {
      throw new Error(`Missing or ambiguous zone assignment: ${zone}`);
    }
    const { mapId, worldRegion } = matches[0];
    const worldX = worldRegion[3] - y / 100 * (worldRegion[3] - worldRegion[0]);
    const worldY = worldRegion[4] - x / 100 * (worldRegion[4] - worldRegion[1]);
    const point = project(mapId, [worldX, worldY]);
    if (!point || point.x < atlas.bounds.minX || point.x > atlas.bounds.maxX
      || point.y < atlas.bounds.minY || point.y > atlas.bounds.maxY) {
      throw new Error(`NPC projects outside atlas zone ${zone}`);
    }
    return point;
  };
  const tinkmaster = search.locations.find(({ point }) => point.name === "Tinkmaster Overspark"
    && point.category === "profession-trainer")?.point;
  const calibration = position("Ironforge", 69.7, 50.2);
  if (!tinkmaster || Math.hypot(calibration.x - tinkmaster.x, calibration.y - tinkmaster.y) > 5) {
    throw new Error("Quest coordinate projection does not match the known Tinkmaster pin");
  }

  const locations = [...reports.values()].sort((a, b) => a.name.localeCompare(b.name)).map((report) => {
    const id = slug(report.name);
    const zone = zoneByPlace[report.region] ?? report.region.split(",")[0];
    if (english.map.questNpcs?.names?.[id] !== report.name
      || english.map.questNpcs?.regions?.[id] !== report.region) {
      throw new Error(`Missing quest NPC locale text: ${report.name}`);
    }
    const point = position(zone, report.x, report.y);
    return { id: `reported-quest-npc-${id}`,
      name: "", nameKey: `map.questNpcs.names.${id}`,
      category: "npc", label: "", subtype: "quest-npc",
      detailLabelKey: "map.questNpcs.reportedLocation",
      regionId: "", region: "", regionKey: `map.questNpcs.regions.${id}`,
      x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
      referenceCoordinates: { x: report.x, y: report.y },
      questNpcDungeonIds: [...report.dungeonIds].sort() };
  });
  await writeFile(layerPath, `${JSON.stringify({ version: 1,
    projection: { clientBuild: storage.getProductInfo().buildNumber, atlasBuild: atlas.source.build,
      method: "client-ui-map-assignment-zone-percent", positionStatus: "reported" },
    locations }, null, 2)}\n`);
  const indexed = search.locations.filter(({ point }) => !point.id.startsWith("reported-quest-npc-"));
  for (const raw of locations) {
    const id = raw.id.slice("reported-quest-npc-".length);
    indexed.push({ mapId: "azeroth", mapName: "Azeroth",
      point: { ...raw, name: english.map.questNpcs.names[id], label: english.map.categories.npc,
        region: english.map.questNpcs.regions[id] }, count: 1 });
  }
  indexed.sort((a, b) => a.mapName.localeCompare(b.mapName)
    || a.point.name.localeCompare(b.point.name) || a.point.id.localeCompare(b.point.id));
  await writeFile("public/data/map-search/index.json", `${JSON.stringify({ ...search,
    source: { ...search.source, markerCount: indexed.length }, locations: indexed }, null, 2)}\n`);
  console.log(`Published ${locations.length} reported quest NPC pins to ${layerPath}`);
} finally {
  storage.close();
}
