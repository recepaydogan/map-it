/** Examine whether installed AreaTrigger records locate instance entrances. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const instancePois = JSON.parse(await readFile(join(root,
  "data/client-research/instance-poi-candidates.json"), "utf8"));
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`No ${name} registration.`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed in the local client.`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    readableRowCount: reader.getAllIDs().length, omittedSections } };
};
const summarize = (row) => row.map((field, index) => ({ index,
  ...(typeof field.string === "string" ? { string: field.string } : {}),
  ...(field.data !== undefined ? { data: typeof field.data === "bigint"
    ? field.data.toString() : field.data } : {}),
}));
const unpackXYZ = (value) => {
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
};
try {
  if (catalog.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The local client build changed since the table inventory.");
  }
  if (instancePois.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Instance POIs belong to a different client build.");
  }
  const triggers = readTable("AreaTrigger");
  const maps = readTable("Map");
  const actionSets = readTable("AreaTriggerActionSet");
  const createProperties = readTable("AreaTriggerCreateProperties");
  for (const [mapId, name] of [[43, "Wailing Caverns"], [47, "Razorfen Kraul"]]) {
    if (maps.reader.getRowData(mapId)?.[1]?.string !== name) {
      throw new Error(`Map ${mapId} is not ${name} in the local client.`);
    }
  }
  const rows = triggers.reader.getAllIDs().flatMap((id) => {
    const row = triggers.reader.getRowData(id);
    if (!Array.isArray(row)) return [];
    const relationshipId = triggers.reader.getRowRelationship(id) ?? null;
    if (relationshipId !== row[2]?.data) {
      throw new Error(`AreaTrigger ${id} disagrees with its map relationship.`);
    }
    const position = unpackXYZ(row[0].data);
    if (position.some((value) => !Number.isFinite(value))) {
      throw new Error(`AreaTrigger ${id} has an invalid position.`);
    }
    return [{ id, relationshipId, position, fields: summarize(row) }];
  });
  const matches = rows.filter(({ relationshipId, fields }) => relationshipId === 43
    || relationshipId === 47 || fields.some(({ string }) =>
      /wailing caverns|razorfen kraul/i.test(string ?? "")));
  const wailingPoi = instancePois.records.find(({ poiId, name, worldMapId }) =>
    poiId === 1068 && name === "Wailing Caverns" && worldMapId === 1);
  if (!wailingPoi) throw new Error("Wailing Caverns world POI is missing.");
  const nearbyWailingWorldTriggers = rows.filter(({ relationshipId }) =>
    relationshipId === wailingPoi.worldMapId).map((row) => ({
    ...row,
    distanceToPoi: Math.hypot(row.position[0] - wailingPoi.worldPosition[0],
      row.position[1] - wailingPoi.worldPosition[1]),
  })).sort((left, right) => left.distanceToPoi - right.distanceToPoi).slice(0, 10);
  const triggerIds = new Set(matches.map(({ id }) => id));
  const associatedRows = [actionSets, createProperties].map(({ reader, source }) => ({
    table: source.name, rows: reader.getAllIDs().flatMap((id) => {
      const row = reader.getRowData(id);
      const relationshipId = reader.getRowRelationship(id) ?? null;
      if (!Array.isArray(row) || (!triggerIds.has(relationshipId)
        && !row.some(({ data }) => triggerIds.has(data)))) return [];
      return [{ id, relationshipId, fields: summarize(row) }];
    }),
  }));
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [triggers, maps, actionSets, createProperties].map(({ source }) => source),
    instancePoiTables: instancePois.source.tables },
  recordCount: rows.length, sample: rows.slice(0, 5), matches,
  associatedRows, wailingWorldPoi: wailingPoi, nearbyWailingWorldTriggers,
  rule: "The AreaTrigger relationship locates a trigger on its own map. Neither its presence inside a dungeon nor proximity to a world POI establishes a graveyard, doorway, or destination without a source-backed function or transfer relation." };
  await writeFile(join(root, "data/client-research/instance-area-trigger-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${rows.length} AreaTrigger rows; ${matches.length} Wailing/Razorfen numeric or name matches.`);
} finally {
  storage.close();
}
