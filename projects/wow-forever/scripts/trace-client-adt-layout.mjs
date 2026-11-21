/** Inspect local world-map MAID references and object-chunk record layouts. */
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
    if (offset + 8 + size > bytes.length) break;
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
  const records = [];
  for (const wdtFileDataId of [782779, 775971]) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`WDT ${wdtFileDataId} has no MAID.`);
    const known = terrain.maps.find((map) => map.wdtFileDataId === wdtFileDataId);
    const cells = [
      { x: known.grid.minX, y: known.grid.minY },
      { x: Math.floor((known.grid.minX + known.grid.maxX) / 2),
        y: Math.floor((known.grid.minY + known.grid.maxY) / 2) },
    ];
    for (const { x, y } of cells) {
      const fields = [];
      for (let index = 0; index < 8; index++) {
        const id = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + index * 4);
        const info = id ? storage.getFileInfo(fileName(id)) : null;
        let chunks = [];
        let placedModelSamples = [];
        if (info && info.size !== 0xffff_ffff) {
          const fileBytes = storage.readFile(fileName(id));
          const fileChunks = chunksOf(fileBytes);
          chunks = fileChunks.slice(0, 8)
            .map(({ name, size }) => ({ name, size }));
          const mddf = fileChunks.find(({ name }) => name === "MDDF");
          if (mddf && mddf.size % 36 === 0) {
            const distinct = new Set();
            for (let offset = mddf.offset; offset < mddf.offset + mddf.size
              && distinct.size < 10; offset += 36) distinct.add(fileBytes.readUInt32LE(offset));
            placedModelSamples = [...distinct].map((modelFileDataId) => {
              const modelInfo = storage.getFileInfo(fileName(modelFileDataId));
              const available = !!modelInfo && modelInfo.size !== 0xffff_ffff;
              const magic = available ? storage.readFile(fileName(modelFileDataId))
                .subarray(0, 4).toString("latin1") : "";
              return { modelFileDataId, available, magic };
            });
          }
        }
        fields.push({ index, fileDataId: id, available: !!info && info.size !== 0xffff_ffff,
          chunks, placedModelSamples });
      }
      records.push({ wdtFileDataId, x, y, fields });
    }
  }
  await writeFile(join(root, "data/client-research/adt-layout-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber }, records }, null, 2)}\n`);
  console.log(records.map(({ wdtFileDataId, x, y, fields }) =>
    `${wdtFileDataId} ${x},${y}: ${fields.map(({ index, fileDataId, available, chunks }) =>
      `${index}=${fileDataId}${available ? `(${chunks.map(({ name }) => name).join(",")})` : ""}`).join(" ")}`).join("\n"));
} finally { storage.close(); }
