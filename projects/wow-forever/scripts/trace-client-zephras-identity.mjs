/** Search local map tables for a client-file identity for the visual island inset. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const targetWdtFileDataId = 7198644;
const tableNames = ["Map", "UiMap", "UiMapArt", "UiMapArtStyleLayer", "UiMapXMapArt",
  "UiMapAssignment", "AreaTable", "AreaPOI", "LFGDungeons", "JournalInstance",
  "JournalInstanceEntrance"];
const indexed = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (atlas.source?.build !== build) throw new Error("The inset atlas and local client differ in build.");
  const sourceTables = [];
  const nameMatches = [];
  const wdtIdMatches = [];
  const mapIdMatches = [];
  const identityRows = [];
  const assignmentRows = [];
  const mapField7Comparisons = [];
  const comparisonRows = [];
  for (const name of tableNames) {
    const record = indexed.get(name);
    if (!record) throw new Error(`Missing local registration for ${name}.`);
    const file = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const bytes = storage.readFile(file);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
      throw new Error(`${name} layout changed since the client inventory.`);
    }
    sourceTables.push({ name, fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rowCount: reader.getAllIDs().length, omittedSections });
    for (const id of reader.getAllIDs()) {
      const row = reader.getRowData(id);
      if (Array.isArray(row)) {
        if (name === "Map" && [0, 1, 43, 2991].includes(id)) {
          mapField7Comparisons.push({ mapId: id, name: row[1]?.string ?? null,
            field7Value: row[7]?.data ?? null, wdtFileDataId: row[21]?.data ?? null });
        }
        if (name === "Map" && [0, 1, 30, 37, 43, 129, 489, 529, 2991, 2996, 2997].includes(id)) {
          comparisonRows.push({ mapId: id, name: row[1]?.string ?? null,
            fields: row.map((field, index) => ({ index,
              ...(typeof field?.string === "string" ? { string: field.string } : {}),
              ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
                ? field.data.toString() : field.data } : {}),
            })) });
        }
        let matchedName = false;
        row.forEach((field, fieldIndex) => {
          if (typeof field?.string === "string" && /zephra/i.test(field.string)) {
            matchedName = true;
            nameMatches.push({ table: name, rowId: id, fieldIndex,
              value: field.string, relationshipId: reader.getRowRelationship(id) ?? null });
          }
          if (field?.data === targetWdtFileDataId
            || field?.data === BigInt(targetWdtFileDataId)) {
            wdtIdMatches.push({ table: name, rowId: id, fieldIndex,
              value: targetWdtFileDataId });
          }
          if ((field?.data === 2991 || field?.data === 2991n)
            && id !== 2991) {
            mapIdMatches.push({ table: name, rowId: id, fieldIndex,
              value: 2991 });
          }
        });
        if (matchedName) identityRows.push({ table: name, rowId: id,
          relationshipId: reader.getRowRelationship(id) ?? null,
          fields: row.map((field, index) => ({ index,
            ...(typeof field?.string === "string" ? { string: field.string } : {}),
            ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
              ? field.data.toString() : field.data } : {}),
          })) });
        if (name === "UiMapAssignment" && row.some((field) =>
          field?.data === 2991 || field?.data === 2991n)) {
          assignmentRows.push({ rowId: id,
            relationshipId: reader.getRowRelationship(id) ?? null,
            fields: row.map((field, index) => ({ index,
              ...(typeof field?.string === "string" ? { string: field.string } : {}),
              ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
                ? field.data.toString() : field.data } : {}),
            })) });
        }
      } else if (row?.type === "sparse" && Buffer.isBuffer(row.data)) {
        const text = row.data.toString("latin1");
        const match = text.match(/[\x20-\x7e]*zephra[\x20-\x7e]*/i);
        if (match) nameMatches.push({ table: name, rowId: id,
          byteOffset: match.index, value: match[0].slice(0, 200) });
      }
    }
  }
  await writeFile(join(root, "data/client-research/zephras-client-identity.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      tables: sourceTables }, targetWdtFileDataId,
    rule: "Case-insensitive Zephra name search and exact numeric WDT FileDataID search in locally decoded map, area, and instance tables.",
    nameMatches, wdtIdMatches, mapIdMatches, identityRows,
    assignmentRows, mapField7Comparisons, comparisonRows }, null, 2)}\n`);
  console.log(`Found ${nameMatches.length} Zephra name, ${wdtIdMatches.length} WDT-ID, and ${mapIdMatches.length} map-ID matches in ${tableNames.length} local tables.`);
} finally {
  storage.close();
}
