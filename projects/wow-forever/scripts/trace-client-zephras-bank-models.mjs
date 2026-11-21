/** Check the separate Zephras ADTs for additional bank/vault structures. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const atlas = JSON.parse(await readFile(join(root,
  "public/maps/world-atlas/metadata.json"), "utf8"));
const inset = atlas.terrainLayers.find(({ source }) => source?.mapId === 2991);
if (!inset?.source?.wdtFileDataId) throw new Error("Missing Zephras WDT source.");
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed chunk at ${offset}.`);
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4)
      .split("").reverse().join(""), offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== atlas.source.build) throw new Error("Installed game build changed.");
  const wdt = storage.readFile(fileName(inset.source.wdtFileDataId));
  const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
  if (!maid || maid.size !== 64 * 64 * 32) throw new Error("Invalid Zephras WDT.");
  const placements = [];
  const models = new Map();
  let objectAdts = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
    if (!adtFileDataId) continue;
    objectAdts += 1;
    const bytes = storage.readFile(fileName(adtFileDataId));
    const modf = chunksOf(bytes).find(({ name }) => name === "MODF");
    if (!modf || modf.size % 64) throw new Error(`Invalid MODF in ${adtFileDataId}.`);
    for (let offset = modf.offset; offset < modf.offset + modf.size; offset += 64) {
      const modelFileDataId = bytes.readUInt32LE(offset);
      if (!models.has(modelFileDataId)) {
        const modelBytes = storage.readFile(fileName(modelFileDataId));
        const names = [...new Set(modelBytes.toString("latin1")
          .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])]
          .filter((value) => /bank|vault|treasur|depositor/i.test(value));
        models.set(modelFileDataId, names);
      }
      const names = models.get(modelFileDataId);
      if (!names.length) continue;
      const position = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
      const halfWorld = 32 * (1600 / 3);
      placements.push({ adtFileDataId, adtCell: [x, y],
        uniqueId: bytes.readUInt32LE(offset + 4), modelFileDataId,
        names, worldPosition: [halfWorld - position[2],
          halfWorld - position[0], position[1]],
        rotationDegrees: [20, 24, 28].map((delta) =>
          bytes.readFloatLE(offset + delta)),
        doodadSetIndex: bytes.readUInt16LE(offset + 58) });
    }
  }
  const distinct = [...new Map(placements.map((placement) =>
    [`${placement.uniqueId}:${placement.modelFileDataId}`, placement])).values()];
  await writeFile(join(root, "data/client-research/zephras-bank-model-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build, mapId: 2991, wdtFileDataId: inset.source.wdtFileDataId },
    objectAdts, inspectedWorldModels: models.size,
    matchingRawAdtRecords: placements.length,
    distinctPlacements: distinct }, null, 2)}\n`);
  console.log(`Zephras: ${objectAdts} object ADTs, ${models.size} world models, ${distinct.length} bank/vault-like structures.`);
  console.log(distinct.map(({ modelFileDataId, uniqueId, names }) =>
    `${modelFileDataId} ${uniqueId}: ${names.join(", ")}`).join("\n"));
} finally {
  storage.close();
}
