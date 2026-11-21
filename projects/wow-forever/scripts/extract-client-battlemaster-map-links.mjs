/** Join client battleground lists to the playable maps they reference. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const names = ["BattlemasterListXMap", "BattlemasterList", "Map"];
for (const name of names) if (!byName.has(name)) throw new Error(`No local ${name} table.`);
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const tables = new Map(names.map((name) => {
    const table = byName.get(name);
    const bytes = storage.readFile(`FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
      throw new Error(`${name} changed layout since the client inventory.`);
    }
    return [name, { reader, source: { name, fileDataId: table.fileDataId,
      layoutHash: table.layoutHash,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections } }];
  }));
  const cross = tables.get("BattlemasterListXMap").reader;
  const lists = tables.get("BattlemasterList").reader;
  const maps = tables.get("Map").reader;
  const links = cross.getAllIDs().map((id) => {
    const row = cross.getRowData(id);
    const battlemasterListId = cross.getRowRelationship(id);
    if (!Array.isArray(row) || battlemasterListId === undefined) {
      throw new Error(`BattlemasterListXMap ${id} has no list relationship.`);
    }
    const mapId = row[0].data;
    const list = lists.getRowData(battlemasterListId);
    const map = maps.getRowData(mapId);
    return { id, battlemasterListId, battlegroundName: list?.[0]?.string ?? null,
      mapId, mapName: map?.[1]?.string ?? null };
  });
  const output = join(root, "data/client-research/battlemaster-map-links.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [...tables.values()].map(({ source }) => source),
  }, links }, null, 2)}\n`);
  console.log(`Extracted ${links.length} battlemaster-list-to-map links.`);
} finally {
  storage.close();
}
