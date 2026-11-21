/** Check whether the installed client places a Deeprun Tram route or stop. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const paths = await readJson("data/client-research/taxi-path-network.json");
const survey = await readJson("data/client-research/map-placement-survey.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const table = catalog.identified.find(({ name }) => name === "Map");
const triggerTable = catalog.identified.find(({ name }) =>
  name === "AreaTrigger");
const actionSetTable = catalog.identified.find(({ name }) =>
  name === "AreaTriggerActionSet");
if (!table || !triggerTable || !actionSetTable) {
  throw new Error("No Map or AreaTrigger registration in the installed client.");
}
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us",
  localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) =>
  `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== paths.source.build || build !== survey.source.build
    || build !== settlements.source.build) {
    throw new Error("Map, route, and placed-object evidence use different builds.");
  }
  const bytes = storage.readFile(fileName(table.fileDataId));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
    throw new Error("Map table layout changed.");
  }
  const mapRows = reader.getAllIDs().flatMap((id) => {
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || typeof row[1]?.string !== "string"
      || !/tram|deeprun/i.test(row[1].string)) return [];
    return [{ mapId: id, name: row[1].string,
      wdtFileDataId: row[21]?.data ?? null }];
  });
  const tramMapIds = new Set(mapRows.map(({ mapId }) => mapId));
  const taxiPaths = paths.paths.filter(({ nodes }) => nodes.some(({ mapId }) =>
    tramMapIds.has(mapId)));
  const triggerBytes = storage.readFile(fileName(triggerTable.fileDataId));
  const triggerData = readLocalWdc5(triggerBytes);
  if (triggerData.reader.layoutHash.toString(16).padStart(8, "0")
    !== triggerTable.layoutHash) {
    throw new Error("AreaTrigger layout changed.");
  }
  const unpackTrigger = (id) => {
      const row = triggerData.reader.getRowData(id);
      if (!Array.isArray(row)) return null;
      const packed = row[0]?.data;
      if (typeof packed !== "bigint") {
        throw new Error(`AreaTrigger ${id} has no packed position.`);
      }
      const bytes = Buffer.alloc(12);
      for (let index = 0; index < 3; index += 1) {
        bytes.writeUInt32LE(Number((packed >> BigInt(index * 32))
          & 0xffff_ffffn), index * 4);
      }
      return { id, mapId: triggerData.reader.getRowRelationship(id),
        position: [0, 4, 8].map((offset) => bytes.readFloatLE(offset)),
        rawFields: row.map(({ data }) =>
          typeof data === "bigint" ? data.toString() : data ?? null) };
    };
  const insideTramTriggers = triggerData.reader.getAllIDs().filter((id) =>
    tramMapIds.has(triggerData.reader.getRowRelationship(id)))
    .map(unpackTrigger);
  const adjacentTriggerRecords = insideTramTriggers.flatMap(({ id }) =>
    Array.from({ length: 11 }, (_, offset) => unpackTrigger(id - 5 + offset)))
    .filter(Boolean).filter((record, index, records) => records
      .findIndex(({ id }) => id === record.id) === index);
  const targetCityNames = new Set(["Stormwind", "Ironforge"]);
  const cities = settlements.markers.filter(({ name, mapId }) =>
    mapId === 0 && targetCityNames.has(name));
  const worldTriggerCandidates = adjacentTriggerRecords.filter(({ mapId }) =>
    mapId === 0).map((record) => ({ ...record,
    nearbyCities: cities.map(({ locationId, name, worldPosition }) => ({
      locationId, name, distanceWorld: Math.hypot(
        record.position[0] - worldPosition[0],
        record.position[1] - worldPosition[1]),
    })).sort((left, right) => left.distanceWorld - right.distanceWorld),
  }));
  const actionBytes = storage.readFile(fileName(actionSetTable.fileDataId));
  const actionData = readLocalWdc5(actionBytes);
  if (actionData.reader.layoutHash.toString(16).padStart(8, "0")
    !== actionSetTable.layoutHash) {
    throw new Error("AreaTriggerActionSet layout changed.");
  }
  const triggerIds = new Set([...insideTramTriggers, ...worldTriggerCandidates]
    .map(({ id }) => id));
  const actionSetRows = actionData.reader.getAllIDs().flatMap((id) => {
    const row = actionData.reader.getRowData(id);
    const relationshipId = actionData.reader.getRowRelationship(id) ?? null;
    if (!triggerIds.has(relationshipId)
      && !row.some(({ data }) => triggerIds.has(data))) return [];
    return [{ id, relationshipId, fields: row.map(({ data, string }) =>
      string ?? (typeof data === "bigint" ? data.toString() : data ?? null)) }];
  });
  const namedPlacedObjects = survey.maps.flatMap(({ mapId, gameObjects }) =>
    gameObjects.filter(({ name }) => /tram|deeprun/i.test(name))
      .map(({ objectId, name, worldPosition }) => ({
        mapId, objectId, name, worldPosition })));
  const report = { source: { product: paths.source.product, build,
    mapTable: { fileDataId: table.fileDataId, sha256, omittedSections },
    areaTriggerTable: { fileDataId: triggerTable.fileDataId,
      sha256: createHash("sha256").update(triggerBytes).digest("hex"),
      omittedSections: triggerData.omittedSections },
    actionSetTable: { fileDataId: actionSetTable.fileDataId,
      sha256: createHash("sha256").update(actionBytes).digest("hex"),
      omittedSections: actionData.omittedSections } },
    rule: "A named Map record identifies the tram map, but a world marker requires a placed entrance or route-stop record. Check mapped TaxiPath geometry and positioned named GameObjects without inferring a station from city names alone.",
    mapRows, taxiPathIdsOnTramMap: taxiPaths.map(({ id }) => id),
    insideTramAreaTriggers: insideTramTriggers,
    adjacentTriggerRecords,
    worldTriggerCandidates,
    actionSetRows,
    namedPlacedObjects };
  await writeFile(join(root, "data/client-research/tram-route-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Tram: ${mapRows.length} named maps, ${taxiPaths.length} taxi paths, ${namedPlacedObjects.length} named placed objects.`);
} finally { storage.close(); }
