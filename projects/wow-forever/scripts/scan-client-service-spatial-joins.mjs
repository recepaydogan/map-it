/** Test numeric joins between client service/NPC tables and positioned tables. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/all-table-registrations.json"), "utf8"));
const byName = new Map(catalog.records.map((record) => [record.name, record]));
const spatialNames = ["GameObjects", "AreaPOI", "Location", "TaxiPathNode"];
const serviceNames = ["Creature", "CreatureDifficulty", "CreatureXDisplayInfo",
  "GossipNPCOption", "GossipNPCOptionDisplayInfo",
  "CollectableSourceVendor", "CollectableSourceVendorSparse"];
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build) throw new Error("Installed game build changed.");
  function openTable(name) {
    const registration = byName.get(name);
    if (!registration?.localAvailable) throw new Error(`Missing ${name} table.`);
    const { reader, omittedSections } = readLocalWdc5(storage.readFile(
      fileName(registration.fileDataId)));
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`Layout mismatch for ${name}.`);
    }
    return { reader, omittedSections };
  }
  const spatial = new Map(spatialNames.map((name) =>
    [name, new Set(openTable(name).reader.getAllIDs())]));
  const tables = [];
  for (const name of serviceNames) {
    const { reader, omittedSections } = openTable(name);
    const ids = reader.getAllIDs();
    const hits = new Map();
    const highIdHits = new Map();
    for (const id of ids) {
      const row = reader.getRowData(id);
      const values = [{ field: "rowId", value: id },
        { field: "relationshipId", value: reader.getRowRelationship(id) }];
      if (Array.isArray(row)) row.forEach(({ data }, index) => {
        if (typeof data === "number") values.push({ field: `${index}`, value: data });
        if (Array.isArray(data)) data.forEach((value, itemIndex) => {
          if (typeof value === "number") values.push({
            field: `${index}[${itemIndex}]`, value });
        });
      });
      for (const { field, value } of values) {
        if (!Number.isSafeInteger(value) || value < 1) continue;
        for (const [target, targetIds] of spatial) {
          if (!targetIds.has(value)) continue;
          const key = `${field}:${target}`;
          const record = hits.get(key) ?? { sourceField: field,
            targetTable: target, count: 0, examples: [] };
          record.count += 1;
          if (record.examples.length < 5) record.examples.push({ sourceId: id,
            targetId: value });
          hits.set(key, record);
          if (value >= 10_000) {
            const high = highIdHits.get(key) ?? { sourceField: field,
              targetTable: target, count: 0, examples: [] };
            high.count += 1;
            if (high.examples.length < 5) high.examples.push({ sourceId: id,
              targetId: value });
            highIdHits.set(key, high);
          }
        }
      }
    }
    tables.push({ name, readableRows: ids.length,
      omittedEncryptedRows: omittedSections.reduce((sum, section) =>
        sum + section.recordCount, 0),
      joins: [...hits.values()].filter(({ count }) => count >= 2)
        .sort((a, b) => b.count - a.count),
      highIdJoins: [...highIdHits.values()].sort((a, b) => b.count - a.count) });
  }
  const report = { source: { product: storage.getProductInfo().codeName, build },
    method: "Compare every numeric scalar, array element, row ID, and relationship ID in client NPC/service tables with IDs of positioned client tables; no name filter is used.",
    caveat: "An overlapping integer is not a confirmed relational key. Low IDs especially collide with unrelated flags and counts; high-ID overlaps are shown separately and still require field semantics and positioned NPC verification.",
    spatialTables: Object.fromEntries([...spatial].map(([name, ids]) =>
      [name, ids.size])), tables };
  await writeFile(join(root, "data/client-research/client-service-spatial-join-scan.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(tables.map(({ name, readableRows, highIdJoins }) =>
    `${name} (${readableRows}): ${highIdJoins.slice(0, 8).map(({ sourceField, targetTable, count }) =>
      `${sourceField}->${targetTable} ${count}`).join(", ") || "no high-ID numeric overlap"}`)
    .join("\n"));
} finally {
  storage.close();
}
