/** Resolve item-set memberships and local spell-name clues from client tables. */
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
    throw new Error("Item records and set tables belong to different client builds.");
  }
  const sets = readTable("ItemSet");
  const bonuses = readTable("ItemSetSpell");
  const spellNames = readTable("SpellName");
  const itemNames = new Map(candidates.records.map(({ itemId, name }) => [itemId, name]));
  const bonusesBySet = new Map();
  for (const bonusId of bonuses.reader.getAllIDs()) {
    const row = bonuses.reader.getRowData(bonusId);
    const itemSetId = bonuses.reader.getRowRelationship(bonusId);
    const spellId = row?.[1]?.data;
    if (!Array.isArray(row) || !Number.isSafeInteger(itemSetId)
      || !Number.isSafeInteger(spellId)) {
      throw new Error(`Invalid ItemSetSpell row ${bonusId}.`);
    }
    const list = bonusesBySet.get(itemSetId) ?? [];
    list.push({ bonusId, spellId,
      spellName: spellNames.reader.getRowData(spellId)?.[0]?.string ?? null,
      rawRequirementField: row[3]?.data ?? null });
    bonusesBySet.set(itemSetId, list);
  }
  const records = sets.reader.getAllIDs().map((itemSetId) => {
    const row = sets.reader.getRowData(itemSetId);
    if (!Array.isArray(row) || typeof row[0]?.string !== "string"
      || !Array.isArray(row[4]?.data)) {
      throw new Error(`Invalid ItemSet row ${itemSetId}.`);
    }
    const memberItemIds = row[4].data.filter((id) => Number.isSafeInteger(id) && id > 0);
    const members = memberItemIds.map((itemId) => ({ itemId,
      name: itemNames.get(itemId) ?? null }));
    return { itemSetId, name: row[0].string, memberItemIds, members,
      bonuses: bonusesBySet.get(itemSetId) ?? [] };
  });
  const knownMembers = new Set(records.flatMap(({ members }) => members
    .filter(({ name }) => name).map(({ itemId }) => itemId)));
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [sets, bonuses, spellNames].map(({ source }) => source),
    itemCatalogTables: candidates.source.tables },
  setCount: records.length,
  setsWithCatalogMembers: records.filter(({ members }) => members.some(({ name }) => name)).length,
  catalogMemberCount: knownMembers.size,
  completeCatalogSetCount: records.filter(({ members }) => members.length > 0
    && members.every(({ name }) => name)).length,
  rule: "ItemSet member ID arrays directly identify set membership. ItemSetSpell rows join a set and a spell name, but their packed requirement field is retained raw until its interpretation and incomplete client sets are resolved.",
  records };
  await writeFile(join(root, "data/client-research/item-set-links.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.setsWithCatalogMembers} named item sets cover ${knownMembers.size} catalog items; ${report.completeCatalogSetCount} sets have every member named.`);
} finally {
  storage.close();
}
