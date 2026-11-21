/** Recover transport stop clues omitted from the ordinary TaxiPath geometry export. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const network = JSON.parse(await readFile(join(root,
  "data/client-research/taxi-path-network.json"), "utf8"));
const registration = network.source.tables.find(({ name }) =>
  name === "TaxiPathNode");
if (!registration) throw new Error("TaxiPathNode source registration is missing.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us",
  localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) =>
  `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  if (network.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("Taxi paths and local game data use different builds.");
  }
  const bytes = storage.readFile(fileName(registration.fileDataId));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (sha256 !== registration.sha256
    || reader.layoutHash.toString(16).padStart(8, "0")
      !== registration.layoutHash
    || JSON.stringify(omittedSections)
      !== JSON.stringify(registration.omittedSections)) {
    throw new Error("The TaxiPathNode layout differs from the extracted route graph.");
  }
  const paths = new Map(network.paths.map((path) => [path.id, path]));
  const records = [];
  for (const rowId of reader.getAllIDs()) {
    const row = reader.getRowData(rowId);
    if (!Array.isArray(row) || row.length < 9 || row[1]?.data !== rowId) {
      throw new Error(`TaxiPathNode ${rowId} has an unexpected layout.`);
    }
    const path = paths.get(row[2].data);
    const routeNode = path?.nodes[row[3].data];
    if (!path || !routeNode || routeNode.id !== rowId
      || routeNode.mapId !== row[4].data) {
      throw new Error(`TaxiPathNode ${rowId} differs from the route graph.`);
    }
    const rawFields = row.slice(5, 9).map(({ data }) => data);
    if (rawFields.every((value) => value === 0)) continue;
    records.push({ routeNodeId: rowId, pathId: path.id,
      sequence: routeNode.sequence, mapId: routeNode.mapId,
      worldPosition: routeNode.position,
      rawFields,
      pauseCandidate: (rawFields[0] & 2) !== 0 && rawFields[1] > 0 });
  }
  records.sort((left, right) => left.pathId - right.pathId
    || left.sequence - right.sequence);
  const byPath = Map.groupBy(records, ({ pathId }) => pathId);
  const report = { source: { product: network.source.product,
    build: network.source.build, table: "TaxiPathNode",
    fileDataId: registration.fileDataId, sha256, omittedSections },
  rule: "A route node whose first extra field has bit 2 set and second extra field is positive is a candidate stop. This inference is supported by two geographic shoreline positions and repeated waypoint sequences; the raw values are retained because the local file does not name those fields or prove active service.",
  pathsWithExtraFields: byPath.size,
  pathsWithTwoOrMorePauseCandidates: [...byPath.values()].filter((rows) =>
    rows.filter(({ pauseCandidate }) => pauseCandidate).length >= 2).length,
  rawRecordCount: records.length,
  pauseCandidateCount: records.filter(({ pauseCandidate }) =>
    pauseCandidate).length,
  records };
  await writeFile(join(root,
    "data/client-research/transport-stop-candidates.json"),
  `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Found ${report.pauseCandidateCount} transport pause candidates on ${report.pathsWithTwoOrMorePauseCandidates} multi-stop paths.`);
} finally { storage.close(); }
