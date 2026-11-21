/** Match item quality codes to the installed client's named tier colors. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const itemCatalog = JSON.parse(await readFile(join(root,
  "data/client-research/item-catalog-candidates.json"), "utf8"));
const tables = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const registration = tables.identified.find(({ name }) => name === "GlobalColor");
if (!registration) throw new Error("No GlobalColor registration in the local client.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (itemCatalog.source.build !== storage.getProductInfo().buildNumber
    || tables.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Item names and tier colors belong to different client builds.");
  }
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("GlobalColor layout changed in the installed client.");
  }
  const tiers = [
    { code: 0, name: "Poor", colorKey: "ITEM_POOR_COLOR" },
    { code: 1, name: "Common", colorKey: "ITEM_STANDARD_COLOR" },
    { code: 2, name: "Uncommon", colorKey: "ITEM_GOOD_COLOR" },
    { code: 3, name: "Rare", colorKey: "ITEM_SUPERIOR_COLOR" },
    { code: 4, name: "Epic", colorKey: "ITEM_EPIC_COLOR" },
    { code: 5, name: "Legendary", colorKey: "ITEM_LEGENDARY_COLOR" },
    { code: 6, name: "Artifact", colorKey: "ITEM_ARTIFACT_COLOR" },
  ].map((tier) => {
    const match = reader.getAllIDs().flatMap((id) => {
      const row = reader.getRowData(id);
      return row?.[0]?.string === tier.colorKey ? [{ id, value: row[1]?.data }] : [];
    });
    if (match.length !== 1 || !Number.isInteger(match[0].value)) {
      throw new Error(`No unique ${tier.colorKey} color in GlobalColor.`);
    }
    const argb = (match[0].value >>> 0).toString(16).padStart(8, "0");
    return { ...tier, globalColorId: match[0].id, argb: `#${argb}`,
      rgb: `#${argb.slice(2)}`,
      itemCount: itemCatalog.qualityCounts[tier.code] ?? 0 };
  });
  const samples = [25, 19019, 18582].map((id) => {
    const record = itemCatalog.records.find(({ itemId }) => itemId === id);
    if (!record) throw new Error(`Missing local quality example item ${id}.`);
    return { itemId: id, name: record.name, qualityCode: record.qualityCode };
  });
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber, table: {
      name: "GlobalColor", fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections },
    items: itemCatalog.source.tables.filter(({ name }) =>
      name === "ItemSearchName" || name === "Item") },
  tiers, samples,
  rule: "Numeric quality codes follow the seven classic item tiers, corroborated by known local item names. Tier colors are the installed client's exact named GlobalColor values. The semantic code-to-name alignment is inferred from the local names and ordered tier constants; no direct DB2 foreign key joins ItemSearchName to GlobalColor." };
  await writeFile(join(root, "data/client-research/item-quality-color-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Traced ${tiers.length} quality tiers and source colors for ${itemCatalog.recordCount} items.`);
} finally {
  storage.close();
}
