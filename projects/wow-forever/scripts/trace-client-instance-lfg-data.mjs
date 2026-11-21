/** Preserve exact-name LFG rows without inventing level requirements. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const instances = await readJson("data/client-research/published-instance-poi-evidence.json");
const registration = catalog.identified.find(({ name }) => name === "LFGDungeons");
if (!registration) throw new Error("Missing LFGDungeons table registration.");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || instances.source.build !== build) {
    throw new Error("The LFG scan and published instance POIs belong to different builds.");
  }
  const readTable = (name) => {
    const table = catalog.identified.find((record) => record.name === name);
    if (!table) throw new Error(`Missing ${name} table registration.`);
    const bytes = storage.readFile(fileName(table.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
      throw new Error(`${name} layout differs from the local executable.`);
    }
    return { reader, source: { name, fileDataId: table.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      readableRows: reader.getAllIDs().length, omittedSections } };
  };
  const lfg = readTable("LFGDungeons");
  const entranceTables = ["JournalInstance", "JournalInstanceEntrance", "JournalEncounterXMapLoc"]
    .map(readTable);
  const matchesByName = new Map();
  for (const id of lfg.reader.getAllIDs()) {
    const row = lfg.reader.getRowData(id);
    if (!Array.isArray(row) || !row[0]?.string) continue;
    const matches = matchesByName.get(row[0].string) ?? [];
    matches.push({ rowId: id,
      nonzeroNumericFields: row.flatMap((field, index) =>
        index > 0 && typeof field.data === "number" && field.data !== 0
          ? [{ index, value: field.data }] : []),
    });
    matchesByName.set(row[0].string, matches);
  }
  const records = instances.markers.map(({ poiId, name, instanceMapId }) => ({
    poiId, name, instanceMapId, exactNameLfgRows: matchesByName.get(name) ?? [],
  }));
  await writeFile(join(root, "data/client-research/instance-lfg-metadata.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      table: lfg.source, entranceTables: entranceTables.map(({ source }) => source) },
    rule: "Only exact client names join published instance POIs to LFGDungeons rows; numeric fields retain their raw indexes and values.",
    caveat: "These legacy-looking rows do not establish a player-facing entry level, group size, available mode, or current queue support. The three inspected Journal instance/entrance/location tables have no readable rows in this build.",
    records }, null, 2)}\n`);
  console.log(`Traced ${records.reduce((sum, record) => sum + record.exactNameLfgRows.length, 0)} exact-name LFG rows for ${records.length} published instance POIs.`);
} finally {
  storage.close();
}
