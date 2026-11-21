/** Identify the Battered Chest item separately from any world treasure spawn. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`Missing client ${name}.`);
  const bytes = storage.readFile(`FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed since the inventory.`);
  }
  return { reader, source: { name, fileDataId: record.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  const sparse = readTable("ItemSparse");
  const items = readTable("Item");
  const itemEffects = readTable("ItemXItemEffect");
  const objects = readTable("GameObjects");
  const matches = sparse.reader.getAllIDs().flatMap((id) => {
    const row = sparse.reader.getRowData(id);
    if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return [];
    const offset = row.data.indexOf("Battered Chest");
    if (offset < 0 || (offset > 0 && row.data[offset - 1] !== 0)
      || row.data[offset + "Battered Chest".length] !== 0) return [];
    const item = items.reader.getRowData(id);
    return [{ itemId: id, name: "Battered Chest", sparseNameByteOffset: offset,
      sparseRecordSize: row.data.length,
      hasItemRow: Array.isArray(item),
      itemRowData: Array.isArray(item) ? item.map(({ data }) => data) : null }];
  });
  if (matches.length !== 1 || !matches[0].hasItemRow) {
    throw new Error("Battered Chest does not resolve to one readable Item/ItemSparse pair.");
  }
  const itemId = matches[0].itemId;
  const iconFileDataId = matches[0].itemRowData[7];
  if (!Number.isSafeInteger(iconFileDataId) || iconFileDataId <= 0) {
    throw new Error("Battered Chest Item row lacks a local icon FileDataID.");
  }
  const iconBytes = storage.readFile(`FILE${iconFileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const iconBlp = new BLPFile(iconBytes);
  if (iconBlp.width !== 64 || iconBlp.height !== 64) {
    throw new Error("Unexpected Battered Chest item icon dimensions.");
  }
  const iconPath = `maps/client-icons/items/${itemId}.png`;
  await mkdir(join(root, "public/maps/client-icons/items"), { recursive: true });
  await sharp(iconBlp.getPixels(0).readBuffer(),
    { raw: { width: iconBlp.width, height: iconBlp.height, channels: 4 } })
    .png().toFile(join(root, "public", iconPath));
  const linkedItemEffects = itemEffects.reader.getAllIDs().flatMap((id) => {
    if (itemEffects.reader.getRowRelationship(id) !== itemId) return [];
    const row = itemEffects.reader.getRowData(id);
    if (!Array.isArray(row)) throw new Error(`Unreadable item-effect link ${id}.`);
    return [{ linkRowId: id, itemEffectId: row[0].data }];
  });
  const exactNamePlacedObjects = objects.reader.getAllIDs().flatMap((id) => {
    const row = objects.reader.getRowData(id);
    return row?.[0]?.string === matches[0].name
      ? [{ objectId: id, mapId: row[4].data, displayId: row[5].data }] : [];
  });
  await writeFile(join(root, "data/client-research/battered-chest-item.json"),
    `${JSON.stringify({ source: {
      product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      tables: [sparse.source, items.source, itemEffects.source, objects.source],
    }, item: matches[0],
    icon: { itemRowFieldIndex: 7, fileDataId: iconFileDataId,
      sha256: createHash("sha256").update(iconBytes).digest("hex"),
      width: iconBlp.width, height: iconBlp.height, path: iconPath },
    relationScan: { linkedItemEffects, exactNamePlacedObjects },
    caveat: "The client identifies an item named Battered Chest. No exact-name placed GameObjects row or readable ItemXItemEffect link currently joins to it; encrypted sections may hide records. This does not establish a treasure spawn or loot. The Item row fields remain raw until independently verified.",
    }, null, 2)}\n`);
  console.log(`Identified Battered Chest item ${matches[0].itemId}; no world spawn inferred.`);
} finally {
  storage.close();
}
