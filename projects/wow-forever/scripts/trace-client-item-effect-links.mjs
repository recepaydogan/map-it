/** Join locally named items to their native spell-name effects. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidates = JSON.parse(await readFile(join(root,
  "data/client-research/item-sparse-catalog.json"), "utf8"));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`No ${name} registration.`);
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
  if (candidates.source.build !== storage.getProductInfo().buildNumber
    || catalog.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Item names and effects belong to different client builds.");
  }
  const links = readTable("ItemXItemEffect");
  const effects = readTable("ItemEffect");
  const spells = readTable("SpellName");
  const itemNames = new Map(candidates.records.map(({ itemId, name }) => [itemId, name]));
  const unresolved = [];
  const records = links.reader.getAllIDs().flatMap((linkId) => {
    const itemId = links.reader.getRowRelationship(linkId);
    const name = itemNames.get(itemId);
    if (!name) return [];
    const itemEffectId = links.reader.getRowData(linkId)?.[0]?.data;
    if (!Number.isSafeInteger(itemEffectId)) throw new Error(`Invalid item-effect link ${linkId}`);
    const effect = effects.reader.getRowData(itemEffectId);
    const spellId = effect?.[6]?.data;
    const spellName = spells.reader.getRowData(spellId)?.[0]?.string;
    if (!Array.isArray(effect) || !Number.isSafeInteger(spellId)
      || typeof spellName !== "string" || !Number.isSafeInteger(effect[1]?.data)) {
      unresolved.push({ linkId, itemId, itemEffectId,
        reason: !Array.isArray(effect) ? "missing-item-effect" : "missing-spell-name" });
      return [];
    }
    return [{ linkId, itemId, itemName: name, itemEffectId,
      triggerCode: effect[1].data, spellId, spellName }];
  });
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [links, effects, spells].map(({ source }) => source),
    itemCatalogTables: candidates.source.tables },
  linkCount: records.length,
  unresolvedCount: unresolved.length,
  itemCount: new Set(records.map(({ itemId }) => itemId)).size,
  triggerCodeCounts: Object.fromEntries([...new Set(records.map(({ triggerCode }) => triggerCode))]
    .sort((a, b) => a - b).map((code) => [code,
      records.filter(({ triggerCode }) => triggerCode === code).length])),
  rule: "ItemXItemEffect relationship IDs join an item to ItemEffect; ItemEffect field 6 names a SpellName record. Unreadable chains are retained as unresolved evidence and not published. Trigger codes are stored raw until their player-facing meanings are independently verified. A spell name alone does not describe its effect magnitude or activation chance.",
  unresolved, records };
  await writeFile(join(root, "data/client-research/item-effect-links.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.linkCount} named spell-effect links cover ${report.itemCount} items; ${report.unresolvedCount} unresolved.`);
} finally {
  storage.close();
}
