/** Inventory model placements in the two locally installed world-map ADTs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const terrain = JSON.parse(await readFile(join(root, "data/client-map-extraction/wdt-index.json"), "utf8"));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) {
      throw new Error(`Malformed chunk at ${offset}.`);
    }
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4).split("").reverse().join(""),
      offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
try {
  if (storage.getProductInfo().buildNumber !== terrain.source.build) {
    throw new Error("Terrain and local game build differ.");
  }
  const maps = [];
  const modelCounts = new Map();
  const worldModelCounts = new Map();
  for (const { mapId, wdtFileDataId } of [
    { mapId: 1, wdtFileDataId: 782779 },
    { mapId: 0, wdtFileDataId: 775971 },
  ]) {
    const wdtBytes = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdtBytes).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`WDT ${wdtFileDataId} lacks MAID.`);
    let objectAdts = 0;
    let missingAdts = 0;
    let doodadPlacements = 0;
    let worldModelPlacements = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const id = wdtBytes.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!id) continue;
      const info = storage.getFileInfo(fileName(id));
      if (!info || info.size === 0xffff_ffff) { missingAdts++; continue; }
      objectAdts++;
      const bytes = storage.readFile(fileName(id));
      const chunks = chunksOf(bytes);
      const mddf = chunks.find(({ name }) => name === "MDDF");
      const modf = chunks.find(({ name }) => name === "MODF");
      if (!mddf || !modf || mddf.size % 36 || modf.size % 64) {
        throw new Error(`Object ADT ${id} has unexpected model placement chunks.`);
      }
      for (let offset = mddf.offset; offset < mddf.offset + mddf.size; offset += 36) {
        const modelFileDataId = bytes.readUInt32LE(offset);
        modelCounts.set(modelFileDataId, (modelCounts.get(modelFileDataId) ?? 0) + 1);
        doodadPlacements++;
      }
      for (let offset = modf.offset; offset < modf.offset + modf.size; offset += 64) {
        const worldModelFileDataId = bytes.readUInt32LE(offset);
        worldModelCounts.set(worldModelFileDataId,
          (worldModelCounts.get(worldModelFileDataId) ?? 0) + 1);
        worldModelPlacements++;
      }
    }
    const expected = terrain.maps.find((map) => map.wdtFileDataId === wdtFileDataId);
    if (!expected || objectAdts !== expected.tileCount || missingAdts !== 0) {
      throw new Error(`World map ${mapId} has incomplete local object ADTs.`);
    }
    maps.push({ mapId, wdtFileDataId,
      wdtSha256: createHash("sha256").update(wdtBytes).digest("hex"),
      objectAdts, missingAdts, doodadPlacements, worldModelPlacements });
  }
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber },
  rule: "ADT model placements identify static artwork, not interactive game objects or service NPCs.",
  maps, distinctDoodadModels: modelCounts.size, distinctWorldModels: worldModelCounts.size,
  doodadModels: [...modelCounts].map(([fileDataId, placements]) => ({ fileDataId, placements })),
  worldModels: [...worldModelCounts].map(([fileDataId, placements]) => ({ fileDataId, placements })) };
  await writeFile(join(root, "data/client-research/adt-placement-profile.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${maps.map(({ mapId, objectAdts, missingAdts, doodadPlacements, worldModelPlacements }) =>
    `Map ${mapId}: ${objectAdts} object ADTs, ${missingAdts} missing, ${doodadPlacements} doodads, ${worldModelPlacements} WMOs`).join("\n")}\n`
    + `${modelCounts.size} distinct doodad models, ${worldModelCounts.size} distinct WMOs.`);
} finally { storage.close(); }
