/** Build map pins only from gathering locations observed in WoW Forever. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const tables = await readJson("data/client-research/db2-table-names.json");
const assignment = tables.identified.find(({ name }) => name === "UiMapAssignment");
if (!assignment || atlas.source?.uiMapAssignmentFileDataId !== assignment.fileDataId) {
  throw new Error("Atlas UiMapAssignment metadata is missing or mismatched");
}

const unpackFloats = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const sameFloats = (a, b) => a?.length === b?.length
  && a.every((number, index) => Math.abs(number - b[index]) < 0.0001);

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
let projectZonePoint;
try {
  const file = `FILE${assignment.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader } = readLocalWdc5(storage.readFile(file));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== assignment.layoutHash) {
    throw new Error("UiMapAssignment layout changed");
  }
  const byUiMap = new Map();
  for (const id of reader.getAllIDs()) {
    const uiMapId = reader.getRowRelationship(id);
    const row = reader.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const rows = byUiMap.get(uiMapId) ?? [];
    rows.push({ mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6),
      uiMin: unpackFloats(row[0].data, 2), uiMax: unpackFloats(row[1].data, 2) });
    byUiMap.set(uiMapId, rows);
  }
  for (const layer of atlas.terrainLayers.filter(({ source }) => [0, 1].includes(source?.mapId))) {
    const current = (byUiMap.get(947) ?? []).find(({ mapId }) => mapId === layer.source.mapId);
    if (!current || !sameFloats(current.worldRegion, layer.source.worldRegion)
      || !sameFloats(current.uiMin, layer.source.uiMin)
      || !sameFloats(current.uiMax, layer.source.uiMax)) {
      throw new Error(`Current client world assignment differs from atlas map ${layer.source.mapId}`);
    }
  }
  const project = createClientWorldProjector(atlas);
  projectZonePoint = (uiMapId, zoneX, zoneY) => {
    const rows = byUiMap.get(uiMapId) ?? [];
    if (rows.length !== 1 || ![0, 1].includes(rows[0].mapId)) return null;
    const { mapId, worldRegion } = rows[0];
    const worldX = worldRegion[3] - zoneY / 100 * (worldRegion[3] - worldRegion[0]);
    const worldY = worldRegion[4] - zoneX / 100 * (worldRegion[4] - worldRegion[1]);
    const point = project(mapId, [worldX, worldY]);
    if (!point || point.x < atlas.bounds.minX || point.x > atlas.bounds.maxX
      || point.y < atlas.bounds.minY || point.y > atlas.bounds.maxY) return null;
    return { x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) };
  };
} finally {
  storage.close();
}

const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};
const locations = [];
const nativeIconByKind = new Map([
  ["Earthroot", "earthroot.png"],
  ["Mageroyal", "mageroyal.png"],
  ["Briarthorn", "briarthorn.png"],
  ["Peacebloom", "herbs.png"],
  ["Silverleaf", "silverleaf.png"],
  ["Tin Vein", "tin-ore.png"],
  ["Copper Vein", "ore-veins.png"],
]);
for (const [profession, category] of [["herbalism", "gatherable-herb"], ["mining", "gatherable-ore"]]) {
  const index = await fetchJson(`https://foreverdb.net/data/profguides/${profession}.json`);
  const zones = index.zones.filter(({ fv }) => fv > 0);
  let observedCount = 0;
  for (const zone of zones) {
    const data = await fetchJson(`https://foreverdb.net/data/profguides/${profession}/${zone.m}.json`);
    for (const node of data.nodes) {
      if (node.fv === undefined) continue;
      if (!Array.isArray(node.fv) || node.fv.length % 2 !== 0) throw new Error("Invalid observed coordinates");
      const kind = index.kinds[node.k];
      if (!kind) throw new Error(`Unknown ${profession} kind ${node.k}`);
      for (let offset = 0; offset < node.fv.length; offset += 2) {
        const zoneX = node.fv[offset];
        const zoneY = node.fv[offset + 1];
        if (!Number.isFinite(zoneX) || !Number.isFinite(zoneY)
          || zoneX < 0 || zoneX > 100 || zoneY < 0 || zoneY > 100) {
          throw new Error(`Invalid observed coordinate in ${zone.n}`);
        }
        const position = projectZonePoint(zone.m, zoneX, zoneY);
        if (!position) throw new Error(`Cannot project observed coordinate in ${zone.n}`);
        locations.push({
          id: `observed-${profession}-${zone.m}-${node.k}-${zoneX}-${zoneY}`.replace(/\./g, "-"),
          name: kind.n,
          category,
          label: "",
          subtype: profession,
          regionId: "",
          region: zone.n,
          ...position,
          referenceCoordinates: { x: zoneX, y: zoneY },
          descriptionKey: "map.gathering.observedPinDescription",
          ...(nativeIconByKind.has(kind.n)
            ? { iconPath: `maps/client-icons/gathering/${nativeIconByKind.get(kind.n)}` }
            : {}),
          ...(kind.item > 0 ? { itemId: String(kind.item) } : {}),
        });
        observedCount += 1;
      }
    }
  }
  if (observedCount !== index.seenPins) {
    throw new Error(`${profession}: expected ${index.seenPins} observed points, got ${observedCount}`);
  }
}
if (!locations.length) throw new Error("No observed gathering points were found");
locations.sort((a, b) => a.id.localeCompare(b.id));
await writeFile("public/maps/world-atlas/locations-gatherables.json", `${JSON.stringify({
  version: 1,
  projection: { atlasBuild: atlas.source.build, positionStatus: "observed" },
  locations,
}, null, 2)}\n`);
console.log(`Built ${locations.length} observed gathering pins`);
