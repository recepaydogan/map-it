/** Profile every readable ItemSparse row in the installed client. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { decodeClientItemSparse } from "./lib/decode-client-item-sparse.mjs";
import { calculateClientItemCombat } from "./lib/calculate-client-item-combat.mjs";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const registered = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const previous = JSON.parse(await readFile(join(root, "data/client-research/item-catalog-candidates.json"), "utf8"));
const byName = new Map(registered.identified.map((entry) => [entry.name, entry]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`Missing ${name} table registration`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed in the installed client`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    layoutHash: registration.layoutHash,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    readableRowCount: reader.getAllIDs().length, omittedSections } };
};

try {
  if (registered.source.build !== storage.getProductInfo().buildNumber
    || previous.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Item research and installed client belong to different builds");
  }
  const sparse = readTable("ItemSparse");
  const items = readTable("Item");
  const classes = readTable("ItemClass");
  const subclasses = readTable("ItemSubClass");
  const randPropPoints = readTable("RandPropPoints");
  const itemArmorTotal = readTable("ItemArmorTotal");
  const itemArmorQuality = readTable("ItemArmorQuality");
  const armorLocation = readTable("ArmorLocation");
  if (sparse.source.layoutHash !== "6fcc3191") {
    throw new Error("The ItemSparse decoder only supports layout 6FCC3191");
  }
  const classByCode = new Map(classes.reader.getAllIDs().map((id) => {
    const row = classes.reader.getRowData(id);
    return [row[1].data, row[0].string];
  }));
  const subclassByCodes = new Map(subclasses.reader.getAllIDs().map((id) => {
    const row = subclasses.reader.getRowData(id);
    return [`${subclasses.reader.getRowRelationship(id)}:${row[4].data}`,
      typeof row[1].string === "string" ? row[1].string : row[0].string];
  }));
  const records = sparse.reader.getAllIDs().map((itemId) => {
    const sparseRow = sparse.reader.getRowData(itemId);
    const itemRow = items.reader.getRowData(itemId);
    if (sparseRow?.type !== "sparse" || !Buffer.isBuffer(sparseRow.data)
      || !Array.isArray(itemRow)) throw new Error(`Incomplete item ${itemId}`);
    const data = decodeClientItemSparse(sparseRow.data);
    const classCode = itemRow[0]?.data;
    const subclassCode = itemRow[1]?.data;
    const iconFileDataId = itemRow[7]?.data;
    if (!data.name || !Number.isSafeInteger(classCode) || !Number.isSafeInteger(subclassCode)
      || !Number.isSafeInteger(iconFileDataId) || iconFileDataId < 0
      || data.inventoryType !== itemRow[3]?.data
      || !Number.isSafeInteger(data.itemLevel) || data.itemLevel < 1
      || !Number.isSafeInteger(data.qualityCode) || data.qualityCode < 0 || data.qualityCode > 7) {
      throw new Error(`Invalid name, class, icon, level, or quality on item ${itemId}`);
    }
    const combat = calculateClientItemCombat({ classCode, subclassCode,
      inventoryType: data.inventoryType, itemLevel: data.itemLevel,
      qualityCode: data.qualityCode }, data,
    { randPropPoints: randPropPoints.reader, itemArmorTotal: itemArmorTotal.reader,
      itemArmorQuality: itemArmorQuality.reader, armorLocation: armorLocation.reader });
    return { itemId, name: data.name, description: data.description,
      classCode, className: classByCode.get(classCode) ?? null,
      subclassCode, subclassName: subclassByCodes.get(`${classCode}:${subclassCode}`) ?? null,
      qualityCode: data.qualityCode, itemLevel: data.itemLevel,
      requiredLevel: data.requiredLevel, iconFileDataId,
      stackable: data.stackable, bonding: data.bonding,
      sellPrice: data.sellPrice, buyPrice: data.buyPrice,
      itemDelay: data.itemDelay, inventoryType: data.inventoryType,
      containerSlots: data.containerSlots,
      combat,
      statModifierBonusStat: data.statModifierBonusStat,
      statPercentEditor: data.statPercentEditor };
  });
  const byId = new Map(records.map((record) => [record.itemId, record]));
  const gauntlet = byId.get(234819);
  if (gauntlet?.combat.baseArmor !== 132
    || JSON.stringify(gauntlet.combat.stats) !== JSON.stringify([
      { code: 5, value: 15 }, { code: 6, value: 10 },
      { code: 7, value: 30 }, { code: 50, value: 40 },
    ])) throw new Error("Demonic Gauntlet combat values did not match the client scaling tables");
  for (const old of previous.records) {
    const record = byId.get(old.itemId);
    if (!record || record.name !== old.name || record.qualityCode !== old.qualityCode
      || record.itemLevel !== old.itemLevel || record.requiredLevel !== old.requiredLevel
      || record.iconFileDataId !== old.iconFileDataId
      || record.classCode !== old.classCode || record.subclassCode !== old.subclassCode) {
      throw new Error(`ItemSparse disagrees with verified ItemSearchName item ${old.itemId}`);
    }
  }
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    schema: "WoWDBDefs ItemSparse layout 6FCC3191",
    tables: [sparse, items, classes, subclasses, randPropPoints,
      itemArmorTotal, itemArmorQuality, armorLocation].map(({ source }) => source) },
  recordCount: records.length,
  descriptionCount: records.filter(({ description }) => description).length,
  unresolvedClassCount: records.filter(({ className }) => !className).length,
  unresolvedSubclassCount: records.filter(({ subclassName }) => !subclassName).length,
  iconFileDataIdCount: new Set(records.map(({ iconFileDataId }) => iconFileDataId).filter(Boolean)).size,
  armorCount: records.filter(({ combat }) => combat.baseArmor).length,
  statItemCount: records.filter(({ combat }) => combat.stats?.length).length,
  previousItemCount: previous.records.length,
  rule: "Every published row has readable ItemSparse and Item records. The exact 69977 ItemSparse schema is checked against all previously verified ItemSearchName values. Base stats use StatPercentEditor with the installed RandPropPoints table; armor uses ItemArmorTotal, ItemArmorQuality, and ArmorLocation. Socket-adjusted stats, dynamic item bonuses, encrypted rows, and server loot tables are not inferred.",
  records };
  await writeFile(join(root, "data/client-research/item-sparse-catalog.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.recordCount} items; ${report.descriptionCount} descriptions; ${report.iconFileDataIdCount} distinct icons`);
} finally {
  storage.close();
}
