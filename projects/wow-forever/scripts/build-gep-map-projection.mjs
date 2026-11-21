/** GEP location uses UI-map percentages, not world coordinates. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const catalog = JSON.parse(await readFile("data/client-research/db2-table-names.json", "utf8"));
const table = catalog.identified.find(entry => entry.name === "UiMapAssignment");
const projection = JSON.parse(await readFile("public/data/live-position-projection.json", "utf8"));
const worlds = new Set(projection.layers.map(layer => layer.source.mapId));
const floats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Unexpected UI-map field layout");
  const bytes = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) bytes.writeUInt32LE(Number((value >> BigInt(i * 32)) & 0xffffffffn), i * 4);
  return Array.from({ length: count }, (_, i) => bytes.readFloatLE(i * 4));
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const { reader } = readLocalWdc5(storage.readFile(`FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) throw new Error("UI-map layout changed");
  const assignments = [];
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id), uiMapId = reader.getRowRelationship(id);
    if (!row || row[4].data !== uiMapId || !worlds.has(row[6].data)) continue;
    const uiMin = floats(row[0].data, 2), uiMax = floats(row[1].data, 2), worldRegion = floats(row[2].data, 6);
    if (uiMax[0] <= uiMin[0] || uiMax[1] <= uiMin[1] || worldRegion[3] <= worldRegion[0] || worldRegion[4] <= worldRegion[1]) continue;
    assignments.push({ id, uiMapId, worldMapId: row[6].data, uiMin, uiMax, worldRegion });
  }
  if (!assignments.some(entry => entry.uiMapId === 947)) throw new Error("Atlas UI-map assignments missing");
  await writeFile("public/data/gep-map-projection.json", JSON.stringify({ version: 1, assignments }) + "\n");
  console.log(`Built ${assignments.length} GEP UI-map assignments`);
} finally { storage.close(); }
