/** Join locally extracted terrain WDTs to the client's named Map table. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const terrain = await readJson("data/client-map-extraction/wdt-index.json");
const tileInventory = await readJson("data/client-map-extraction/map-tile-inventory.json");
const mapTable = catalog.identified.find(({ name }) => name === "Map");
if (!mapTable) throw new Error("The installed client does not register Map.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (terrain.source.build !== build || tileInventory.source.build !== build) {
    throw new Error("The extracted terrain and local client differ in build.");
  }
  const fileName = `FILE${mapTable.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== mapTable.layoutHash) {
    throw new Error("The Map layout changed since the local inventory.");
  }
  const mapsByWdt = new Map();
  for (const mapId of reader.getAllIDs()) {
    const row = reader.getRowData(mapId);
    if (!Array.isArray(row) || !row[1]?.string) continue;
    const wdtFileDataId = row[21]?.data;
    if (!Number.isInteger(wdtFileDataId) || wdtFileDataId <= 0) continue;
    const matches = mapsByWdt.get(wdtFileDataId) ?? [];
    matches.push({ mapId, name: row[1].string,
      numericFields: row.map((field, index) => ({ index,
        value: typeof field?.data === "bigint" ? field.data.toString()
          : field?.data ?? null })),
    });
    mapsByWdt.set(wdtFileDataId, matches);
  }
  const records = terrain.maps.map(({ wdtFileDataId, tileCount, grid }) => ({
    wdtFileDataId, tileCount, grid,
    maps: mapsByWdt.get(wdtFileDataId) ?? [],
  }));
  const candidates = tileInventory.extractedMapCandidates.map(({ wdtFileDataId,
    nativeTileCount, mapId, identity, identityStatus }) => {
    const terrainRecord = terrain.maps.find((item) => item.wdtFileDataId === wdtFileDataId);
    const maps = mapsByWdt.get(wdtFileDataId) ?? [];
    if (!terrainRecord || terrainRecord.tileCount !== nativeTileCount
      || identityStatus !== "verified-client-map-join"
      || maps.length !== 1 || maps[0].mapId !== mapId || maps[0].name !== identity) {
      throw new Error(`Extracted WDT ${wdtFileDataId} no longer matches its client map identity.`);
    }
    return { wdtFileDataId, nativeTileCount, maps };
  });
  await writeFile(join(root, "data/client-research/wdt-map-identities.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build, table: "Map", fileDataId: mapTable.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections,
      terrainIndex: "data/client-map-extraction/wdt-index.json" },
    rule: "Exact Map row WDT FileDataID field 21 join; raw numeric fields are retained without assigning undocumented type semantics.",
    records, extractedMapCandidates: candidates }, null, 2)}\n`);
  console.log(`Identified ${records.filter(({ maps }) => maps.length).length} of ${records.length} extracted WDTs; ${candidates.filter(({ maps }) => maps.length).length} of ${candidates.length} map candidates.`);
} finally {
  storage.close();
}
