/** Link locally available quest IDs, POI blobs, and world-space POI points. */
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
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`No local ${name} table.`);
  const bytes = storage.readFile(`FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} changed layout since the client inventory.`);
  }
  return { name, fileDataId: record.fileDataId, reader, omittedSections,
    sha256: createHash("sha256").update(bytes).digest("hex") };
};

try {
  const quests = readTable("QuestV2");
  const questLines = readTable("QuestLineXQuest");
  const blobs = readTable("QuestPOIBlob");
  const points = readTable("QuestPOIPoint");
  const questIds = new Set(quests.reader.getAllIDs());
  const lineByQuest = new Map();
  for (const id of questLines.reader.getAllIDs()) {
    const row = questLines.reader.getRowData(id);
    const lineId = questLines.reader.getRowRelationship(id);
    if (!Array.isArray(row) || lineId === undefined || row[0]?.data !== lineId) {
      throw new Error(`Invalid QuestLineXQuest ${id}.`);
    }
    const questId = row[1].data;
    if (lineByQuest.has(questId)) throw new Error(`Quest ${questId} has duplicate line links.`);
    lineByQuest.set(questId, lineId);
  }
  const pointsByBlob = new Map();
  for (const id of points.reader.getAllIDs()) {
    const row = points.reader.getRowData(id);
    const blobId = points.reader.getRowRelationship(id);
    if (!Array.isArray(row) || blobId === undefined) {
      throw new Error(`QuestPOIPoint ${id} has no blob relationship.`);
    }
    const point = { id, position: row.slice(1, 4).map(({ data }) => data) };
    const linked = pointsByBlob.get(blobId) ?? [];
    linked.push(point);
    pointsByBlob.set(blobId, linked);
  }
  const records = blobs.reader.getAllIDs().map((id) => {
    const row = blobs.reader.getRowData(id);
    if (!Array.isArray(row) || row[0]?.data !== id) {
      throw new Error(`Invalid QuestPOIBlob ${id}.`);
    }
    const questId = row[5].data;
    if (!questIds.has(questId)) {
      throw new Error(`QuestPOIBlob ${id} references missing local QuestV2 ${questId}.`);
    }
    const linked = pointsByBlob.get(id) ?? [];
    pointsByBlob.delete(id);
    return { id, questId, questLineId: lineByQuest.get(questId) ?? null,
      index: blobs.reader.getRowRelationship(id),
      mapFieldRaw: row[2].data, points: linked };
  });
  if (pointsByBlob.size) {
    throw new Error(`${pointsByBlob.size} QuestPOIPoint groups have no local blob.`);
  }
  const output = join(root, "data/client-research/quest-poi-graph.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [quests, questLines, blobs, points].map(({ name, fileDataId, sha256, omittedSections }) =>
      ({ name, fileDataId, sha256, omittedSections })),
  }, quests: records }, null, 2)}\n`);
  console.log(`Linked ${new Set(records.map(({ questId }) => questId)).size} quest IDs, ${records.length} POI blobs, and ${records.reduce((sum, record) => sum + record.points.length, 0)} points.`);
} finally {
  storage.close();
}
