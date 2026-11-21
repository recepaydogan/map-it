/** Preserve named ambient positions without presenting them as map markers. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const examples = await readJson("docs/marker-research-examples.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const tableRecord = catalog.identified.find(({ name }) => name === "SoundEmitters");
if (!tableRecord) throw new Error("SoundEmitters is not locally available.");
const normalize = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const personFields = ["battlemaster", "trainer", "merchant", "innkeeper",
  "transmogrifier", "stableMaster", "banker", "vendor", "auctioneer"];
const targets = examples.examples.flatMap((example) => [
  { seedName: example.name, term: example.name },
  ...personFields.flatMap((field) => typeof example.details?.[field] === "string"
    ? [{ seedName: example.name,
      term: example.details[field].replace(/\s+\([^)]*\)$/, "") }] : []),
]).concat([{ seedName: "Feathermoon, Feralas", term: "Feathermoon" }])
  .sort((left, right) => normalize(right.term).length - normalize(left.term).length);
const project = createClientWorldProjector(atlas);
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const unpackPosition = (value) => {
  if (typeof value !== "bigint") throw new Error("Expected packed sound position.");
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  const position = [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
  if (!position.every(Number.isFinite)) throw new Error("Invalid sound emitter position.");
  return position;
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const bytes = storage.readFile(fileName(tableRecord.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== tableRecord.layoutHash
    || atlas.source?.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The sound table or atlas changed since extraction.");
  }
  const records = [];
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    if (!Array.isArray(row) || typeof row[0]?.string !== "string") continue;
    const sourceName = row[0].string;
    const match = targets.find(({ term }) => normalize(sourceName).includes(normalize(term)));
    if (!match) continue;
    const mapId = reader.getRowRelationship(id);
    const worldPosition = unpackPosition(row[1].data);
    records.push({ id, seedName: match.seedName, matchTerm: match.term,
      sourceName, mapId, worldPosition,
      atlasPosition: project(mapId, worldPosition) });
  }
  const output = join(root, "data/client-research/named-sound-clues.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    table: tableRecord.name, fileDataId: tableRecord.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections,
  }, note: "Ambient emitters locate sounds, not city centers or instance entrances.",
  records }, null, 2)}\n`);
  console.log(`Preserved ${records.length} named ambient location clues.`);
} finally {
  storage.close();
}
