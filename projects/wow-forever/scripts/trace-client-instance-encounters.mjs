/** Join client DungeonEncounter names to published instance Map IDs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const published = await readJson("data/client-research/published-instance-poi-evidence.json");
const registration = catalog.identified.find(({ name }) => name === "DungeonEncounter");
if (!registration) throw new Error("DungeonEncounter is absent from the local client inventory.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || published.source.build !== build) {
    throw new Error("Published instances and DungeonEncounter belong to different client builds.");
  }
  const fileName = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("DungeonEncounter layout changed since the local table inventory.");
  }
  const byMapId = new Map(published.markers.map(({ instanceMapId }) => [instanceMapId, []]));
  for (const id of reader.getAllIDs()) {
    const mapId = reader.getRowRelationship(id);
    if (!byMapId.has(mapId)) continue;
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || row[1]?.data !== id || row[2]?.data !== mapId
      || typeof row[0]?.string !== "string" || !row[0].string.trim()) {
      throw new Error(`DungeonEncounter ${id} does not identify a named instance encounter.`);
    }
    byMapId.get(mapId).push({ encounterId: id, name: row[0].string });
  }
  const records = published.markers.map(({ poiId, locationId, name, instanceMapId }) => ({
    poiId, locationId, name, instanceMapId,
    encounters: byMapId.get(instanceMapId).sort((left, right) =>
      left.name.localeCompare(right.name)),
  }));
  const count = records.reduce((sum, record) => sum + record.encounters.length, 0);
  if (records.length !== 6 || count !== 46 || records.some(({ encounters }) => !encounters.length)) {
    throw new Error(`Unexpected published instance encounter coverage: ${records.length} maps, ${count} encounters.`);
  }
  await writeFile(join(root, "data/client-research/instance-encounter-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build, table: "DungeonEncounter", fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections, instanceSource: published.source },
    rule: "DungeonEncounter's relationship and row map field both equal a published instance Map ID. Names are shown as encounters, because some rows describe a group or event instead of one boss.",
    caveat: "The table does not locate a boss, establish encounter order, or identify its drops.",
    records }, null, 2)}\n`);
  console.log(`Traced ${count} named encounters across ${records.length} published instances.`);
} finally {
  storage.close();
}
