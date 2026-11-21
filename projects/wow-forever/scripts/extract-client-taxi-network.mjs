/** Preserve the client flight-path graph without inventing endpoint markers. */
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
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`No locally identified ${name} table.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} changed layout since the local table inventory.`);
  }
  return { record, reader, omittedSections,
    sha256: createHash("sha256").update(bytes).digest("hex") };
};
const positionFromPackedFloats = (value) => {
  if (typeof value !== "bigint") throw new Error("Expected three packed position floats.");
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  const position = [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
  if (!position.every(Number.isFinite)) throw new Error("Invalid flight path position.");
  return position;
};

try {
  const pathTable = readTable("TaxiPath");
  const nodeTable = readTable("TaxiPathNode");
  const nodesByPath = new Map();
  for (const id of nodeTable.reader.getAllIDs()) {
    const row = nodeTable.reader.getRowData(id);
    if (!Array.isArray(row) || row[1]?.data !== id) {
      throw new Error(`Invalid TaxiPathNode ${id}.`);
    }
    const pathId = row[2].data;
    const node = { id, sequence: row[3].data, mapId: row[4].data,
      position: positionFromPackedFloats(row[0].data) };
    const nodes = nodesByPath.get(pathId) ?? [];
    nodes.push(node);
    nodesByPath.set(pathId, nodes);
  }
  const paths = pathTable.reader.getAllIDs().map((id) => {
    const row = pathTable.reader.getRowData(id);
    if (!Array.isArray(row) || row[0]?.data !== id) {
      throw new Error(`Invalid TaxiPath ${id}.`);
    }
    const nodes = nodesByPath.get(id) ?? [];
    nodes.sort((a, b) => a.sequence - b.sequence);
    if (!nodes.every((node, index) => node.sequence === index)) {
      throw new Error(`Flight path ${id} has a broken node sequence.`);
    }
    nodesByPath.delete(id);
    return { id, fromTaxiNodeId: row[1].data, toTaxiNodeId: row[2].data,
      costFieldRaw: row[3].data, nodes };
  });
  if (nodesByPath.size) {
    throw new Error(`Found nodes for ${nodesByPath.size} missing TaxiPath records.`);
  }
  const output = join(root, "data/client-research/taxi-path-network.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [pathTable, nodeTable].map(({ record, omittedSections, sha256 }) => ({
      name: record.name, fileDataId: record.fileDataId,
      layoutHash: record.layoutHash, sha256, omittedSections,
    })),
  }, unresolvedEndpointTable: "TaxiNodes", paths }, null, 2)}\n`);
  console.log(`Extracted ${paths.length} flight paths and ${paths.reduce((sum, path) => sum + path.nodes.length, 0)} nodes.`);
  console.log(`${paths.filter(({ nodes }) => nodes.length === 0).length} paths have no locally available geometry.`);
} finally {
  storage.close();
}
