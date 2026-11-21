/** Join local item names, classes, qualities and icon references without guessing sources. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`No ${name} table registration.`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed in the installed client.`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    readableRowCount: reader.getAllIDs().length, omittedSections } };
};
try {
  if (catalog.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The item tables and local client belong to different builds.");
  }
  const itemNames = readTable("ItemSearchName");
  const items = readTable("Item");
  const sparse = readTable("ItemSparse");
  const classes = readTable("ItemClass");
  const subclasses = readTable("ItemSubClass");
  const classByCode = new Map(classes.reader.getAllIDs().map((id) => {
    const row = classes.reader.getRowData(id);
    return [row[1].data, row[0].string];
  }));
  const subclassByCodes = new Map(subclasses.reader.getAllIDs().map((id) => {
    const row = subclasses.reader.getRowData(id);
    const classCode = subclasses.reader.getRowRelationship(id);
    return [`${classCode}:${row[4].data}`, typeof row[1].string === "string"
      ? row[1].string : row[0].string];
  }));
  const records = itemNames.reader.getAllIDs().map((id) => {
    const nameRow = itemNames.reader.getRowData(id);
    const itemRow = items.reader.getRowData(id);
    const sparseRow = sparse.reader.getRowData(id);
    if (!Array.isArray(nameRow) || !Array.isArray(itemRow)
      || sparseRow?.type !== "sparse" || !Buffer.isBuffer(sparseRow.data)) {
      throw new Error(`Item ${id} does not have all three readable source records.`);
    }
    const name = nameRow[0]?.string;
    const nameBytes = Buffer.from(name ?? "", "utf8");
    const sparseNameOffset = sparseRow.data.indexOf(nameBytes);
    if (!name || sparseNameOffset < 0
      || (sparseNameOffset > 0 && sparseRow.data[sparseNameOffset - 1] !== 0)
      || sparseRow.data[sparseNameOffset + nameBytes.length] !== 0) {
      throw new Error(`Item ${id} name does not agree with its ItemSparse record.`);
    }
    const classCode = itemRow[0]?.data;
    const subclassCode = itemRow[1]?.data;
    const qualityCode = nameRow[1]?.data;
    const requiredLevelRaw = nameRow[6]?.data;
    const itemLevel = nameRow[10]?.data;
    const iconFileDataId = itemRow[7]?.data;
    if (![classCode, subclassCode, qualityCode, iconFileDataId,
      requiredLevelRaw, itemLevel].every(Number.isSafeInteger)
      || iconFileDataId < 0 || requiredLevelRaw >>> 10 !== 1
      || requiredLevelRaw % 1024 > itemLevel || itemLevel < 1 || itemLevel > 100) {
      throw new Error(`Item ${id} has invalid class, quality, level, or icon fields.`);
    }
    return { itemId: id, name, classCode, className: classByCode.get(classCode) ?? null,
      subclassCode, subclassName: subclassByCodes.get(`${classCode}:${subclassCode}`) ?? null,
      qualityCode, itemLevel, requiredLevel: requiredLevelRaw % 1024,
      iconFileDataId, sparseNameOffset };
  });
  const qualityCounts = Object.fromEntries([...new Set(records.map(({ qualityCode }) => qualityCode))]
    .sort((a, b) => a - b).map((code) => [code,
      records.filter(({ qualityCode }) => qualityCode === code).length]));
  const classCounts = Object.fromEntries([...new Set(records.map(({ className }) => className ?? "unknown"))]
    .sort().map((name) => [name, records.filter(({ className }) => (className ?? "unknown") === name).length]));
  const result = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [itemNames, items, sparse, classes, subclasses].map(({ source }) => source) },
  recordCount: records.length,
  uniqueIconFileDataIds: new Set(records.map(({ iconFileDataId }) => iconFileDataId)).size,
  unresolvedClassCount: records.filter(({ className }) => !className).length,
  unresolvedSubclassCount: records.filter(({ subclassName }) => !subclassName).length,
  qualityCounts, classCounts,
  rule: "Each entry requires an ItemSearchName, Item, and ItemSparse row with an exact null-delimited name match. Class/subclass labels come from ItemClass/ItemSubClass. ItemSearchName field 10 is the item level; field 6 consistently stores 1024 plus the required level, corroborated by known local items and its never exceeding item level. Quality remains a client numeric code until its labels are verified. The icon is a FileDataID reference. Acquisition, drop rates, and combat stats are not inferred.",
  records };
  await writeFile(join(root, "data/client-research/item-catalog-candidates.json"),
    `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${records.length} exact-name item joins; ${result.uniqueIconFileDataIds} icon references; ${result.unresolvedClassCount} unresolved classes; ${result.unresolvedSubclassCount} unresolved subclasses.`);
} finally {
  storage.close();
}
