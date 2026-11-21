/** Project reported Forever rare locations using the installed beta client's UI maps. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const observed = await readJson("public/data/rares/observed.json");
const reports = await readJson("public/data/rares/reported-locations.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const tables = await readJson("data/client-research/db2-table-names.json");
const search = await readJson("public/data/map-search/index.json");
if (observed.entries.length !== 447 || reports.entries.length !== 18
  || search.source?.build !== atlas.source?.build) {
  throw new Error("Rare evidence, reported positions or atlas build changed; review before rebuilding.");
}
const byName = new Map(observed.entries.map((entry) => [entry.name, entry]));
const unpackFloats = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const openTable = (storage, name) => {
  const record = tables.identified.find((entry) => entry.name === name);
  if (!record) throw new Error(`Missing ${name} client table`);
  const file = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader } = readLocalWdc5(storage.readFile(file));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed in installed client`);
  }
  return reader;
};

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
let locations;
try {
  const uiMaps = openTable(storage, "UiMap");
  const assignments = openTable(storage, "UiMapAssignment");
  const mapIdsByName = new Map(uiMaps.getAllIDs().map((id) => [uiMaps.getRowData(id)?.[0]?.string, id]));
  const assignmentsByMap = new Map();
  for (const id of assignments.getAllIDs()) {
    const uiMapId = assignments.getRowRelationship(id);
    const row = assignments.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const values = assignmentsByMap.get(uiMapId) ?? [];
    values.push({ mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6) });
    assignmentsByMap.set(uiMapId, values);
  }
  const project = createClientWorldProjector(atlas);
  locations = reports.entries.map((report) => {
    const npc = byName.get(report.name);
    const assignments = assignmentsByMap.get(mapIdsByName.get(report.zone)) ?? [];
    if (!npc || assignments.length !== 1 || ![0, 1].includes(assignments[0].mapId)
      || ![report.x, report.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
      throw new Error(`Cannot map reported rare ${report.name} in ${report.zone}`);
    }
    const { mapId, worldRegion } = assignments[0];
    const worldX = worldRegion[3] - report.y / 100 * (worldRegion[3] - worldRegion[0]);
    const worldY = worldRegion[4] - report.x / 100 * (worldRegion[4] - worldRegion[1]);
    const point = project(mapId, [worldX, worldY]);
    if (!point || point.x < atlas.bounds.minX || point.x > atlas.bounds.maxX
      || point.y < atlas.bounds.minY || point.y > atlas.bounds.maxY) {
      throw new Error(`Reported rare outside atlas: ${report.name}`);
    }
    return {
      id: `reported-rare-${npc.id}`, entityId: String(npc.id),
      name: npc.name, category: "rare-creature", label: "", subtype: npc.rank,
      regionId: "", region: report.zone,
      x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
      referenceCoordinates: { x: report.x, y: report.y },
    };
  });
  const output = { version: 1, source: { ...reports.source,
    clientBuild: storage.getProductInfo().buildNumber, atlasBuild: atlas.source.build,
    projection: "client-ui-map-assignment-zone-percent" }, locations };
  await writeFile("public/maps/world-atlas/locations-rares.json", `${JSON.stringify(output, null, 2)}\n`);
} finally {
  storage.close();
}
const retained = search.locations.filter(({ point }) => !point.id.startsWith("reported-rare-"));
for (const point of locations) retained.push({ mapId: "azeroth", mapName: "Azeroth",
  point: { ...point, label: "Rare creature" },
  count: 1 });
retained.sort((a, b) => a.mapName.localeCompare(b.mapName)
  || a.point.name.localeCompare(b.point.name) || a.point.id.localeCompare(b.point.id));
await writeFile("public/data/map-search/index.json", JSON.stringify({ ...search,
  source: { ...search.source, markerCount: retained.length }, locations: retained }));
console.log(`Projected ${locations.length} rare reports; ${observed.entries.length} observed rare identities retained.`);
