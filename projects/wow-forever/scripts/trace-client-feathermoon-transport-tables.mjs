/** Inspect local transport tables for a Feathermoon route or dock join. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const indexed = new Map(catalog.identified.map((record) => [record.name, record]));
const tableNames = ["TransportAnimation", "TransportRotation", "TransportPhysics"];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const summarize = (row) => row.map((field, index) => ({ index,
  ...(typeof field?.string === "string" ? { string: field.string.slice(0, 120) } : {}),
  ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
    ? field.data.toString() : field.data } : {}),
}));
try {
  const tables = [];
  for (const name of tableNames) {
    const registration = indexed.get(name);
    if (!registration) throw new Error(`No local ${name} registration.`);
    const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout changed in the local client.`);
    }
    const ids = reader.getAllIDs();
    const matches = [];
    const relationshipCounts = new Map();
    for (const rowId of ids) {
      const row = reader.getRowData(rowId);
      if (!Array.isArray(row)) continue;
      const relationshipId = reader.getRowRelationship(rowId) ?? null;
      if (relationshipId !== null) relationshipCounts.set(relationshipId,
        (relationshipCounts.get(relationshipId) ?? 0) + 1);
      const matchingFields = row.flatMap((field, index) =>
        [24, 54, 303].includes(field?.data) || /feathermoon/i.test(field?.string ?? "")
          ? [{ index, value: field?.data ?? field?.string }] : []);
      if (matchingFields.length || [24, 54, 303].includes(relationshipId)) {
        matches.push({ rowId, relationshipId, matchingFields, fields: summarize(row) });
      }
    }
    tables.push({ name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rowCount: ids.length, omittedSections,
      relationshipCounts: [...relationshipCounts].map(([id, count]) => ({ id, count }))
        .sort((left, right) => right.count - left.count || left.id - right.id),
      firstRows: ids.slice(0, 3).map((rowId) => ({ rowId,
        relationshipId: reader.getRowRelationship(rowId) ?? null,
        fields: summarize(reader.getRowData(rowId) ?? []) })), matches });
  }
  const gameObjects = indexed.get("GameObjects");
  if (!gameObjects) throw new Error("No local GameObjects registration.");
  const gameObjectBytes = storage.readFile(`FILE${gameObjects.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader: gameObjectReader, omittedSections: gameObjectOmissions } = readLocalWdc5(gameObjectBytes);
  if (gameObjectReader.layoutHash.toString(16).padStart(8, "0") !== gameObjects.layoutHash) {
    throw new Error("GameObjects layout changed in the local client.");
  }
  const animationRelationships = tables.find(({ name }) => name === "TransportAnimation")
    .relationshipCounts.map(({ id }) => id);
  const placedObjectJoins = animationRelationships.flatMap((id) => {
    const row = gameObjectReader.getRowData(id);
    return row?.[0]?.string ? [{ id, name: row[0].string,
      mapId: row[4]?.data ?? null, displayId: row[5]?.data ?? null }] : [];
  });
  const displayInfo = indexed.get("GameObjectDisplayInfo");
  if (!displayInfo) throw new Error("No local GameObjectDisplayInfo registration.");
  const displayBytes = storage.readFile(`FILE${displayInfo.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader: displayReader, omittedSections: displayOmissions } = readLocalWdc5(displayBytes);
  if (displayReader.layoutHash.toString(16).padStart(8, "0") !== displayInfo.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed in the local client.");
  }
  const displayJoins = animationRelationships.flatMap((id) => {
    const row = displayReader.getRowData(id);
    if (!Array.isArray(row)) return [];
    const modelFileDataId = row[1]?.data ?? null;
    const modelBytes = Number.isInteger(modelFileDataId) && modelFileDataId > 0
      ? storage.readFile(`FILE${modelFileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`)
      : null;
    return [{ id, modelFileDataId,
      modelNameHints: modelBytes ? [...new Set((modelBytes.toString("latin1")
        .match(/[A-Za-z][A-Za-z0-9_/-]{8,}/g) ?? [])
        .filter((value) => /boat|ship|transport|zepp|ferry/i.test(value)))].slice(0, 20) : [] }];
  });
  await writeFile(join(root, "data/client-research/feathermoon-transport-table-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber },
    targetIds: { taxiNodeId: 54, routePathId: 303, genericTargetTaxiNodeId: 24 },
    rule: "Raw transport table field/relationship matches to the known Feathermoon taxi IDs are clues only; numeric equality does not establish a dock or active boat without a verified table join.",
    tables, placedObjectJoin: {
      fileDataId: gameObjects.fileDataId,
      sha256: createHash("sha256").update(gameObjectBytes).digest("hex"),
      omittedSections: gameObjectOmissions,
      matchingRows: placedObjectJoins,
    }, displayInfoJoin: {
      fileDataId: displayInfo.fileDataId,
      sha256: createHash("sha256").update(displayBytes).digest("hex"),
      omittedSections: displayOmissions,
      matchingRows: displayJoins,
    } }, null, 2)}\n`);
  console.log(tables.map(({ name, rowCount, matches }) =>
    `${name}: ${rowCount} rows, ${matches.length} raw matches`).join("; "));
} finally {
  storage.close();
}
