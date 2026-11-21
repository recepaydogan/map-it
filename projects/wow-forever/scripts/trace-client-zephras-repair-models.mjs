/** Inspect every Zephras Isle ADT model and its local repair-related names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const atlas = JSON.parse(await readFile(join(root,
  "public/maps/world-atlas/metadata.json"), "utf8"));
const layer = atlas.terrainLayers.find(({ source }) => source?.mapId === 2991);
if (!layer?.source?.wdtFileDataId) throw new Error("Missing Zephras WDT.");
const terms = /repair|rugged|blacksmith|smith|forge|armou?r|weapon|anvil|workshop|mechanic|tinker/i;
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
  const wdt = storage.readFile(fileName(layer.source.wdtFileDataId));
  const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
  if (!maid || maid.size !== 64 * 64 * 32) throw new Error("Invalid Zephras WDT.");
  const models = new Map();
  const matching = [];
  const counts = { objectAdts: 0, doodadRecords: 0, worldModelRecords: 0 };
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
    if (!adtFileDataId) continue;
    counts.objectAdts += 1;
    const bytes = storage.readFile(fileName(adtFileDataId));
    const chunks = chunksOf(bytes);
    for (const { kind, chunkName, stride } of [
      { kind: "doodad", chunkName: "MDDF", stride: 36 },
      { kind: "world-model", chunkName: "MODF", stride: 64 },
    ]) {
      const chunk = chunks.find(({ name }) => name === chunkName);
      if (!chunk || chunk.size % stride) throw new Error(`Invalid ${chunkName} in ${adtFileDataId}.`);
      for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += stride) {
        counts[kind === "doodad" ? "doodadRecords" : "worldModelRecords"] += 1;
        const fileDataId = bytes.readUInt32LE(offset);
        const key = `${kind}:${fileDataId}`;
        if (!models.has(key)) {
          const modelBytes = storage.readFile(fileName(fileDataId));
          const names = [...new Set(modelBytes.toString("latin1")
            .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])]
            .filter((value) => terms.test(value)).slice(0, 40);
          let sets = [];
          if (kind === "world-model") {
            const mods = chunksOf(modelBytes).find(({ name }) => name === "MODS");
            if (mods && mods.size % 32 === 0) {
              for (let at = mods.offset; at < mods.offset + mods.size; at += 32) {
                sets.push(modelBytes.toString("latin1", at, at + 20).split("\0")[0]);
              }
            }
          }
          models.set(key, { names, sets });
        }
        const model = models.get(key);
        const setIndex = kind === "world-model" ? bytes.readUInt16LE(offset + 58) : null;
        const selectedSet = setIndex === null ? null : model.sets[setIndex] ?? null;
        if (!model.names.length && !terms.test(selectedSet ?? "")) continue;
        const adtPosition = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
        const halfWorld = 32 * (1600 / 3);
        matching.push({ kind, fileDataId, adtFileDataId,
          uniqueId: bytes.readUInt32LE(offset + 4), names: model.names,
          selectedSet, worldPosition: [halfWorld - adtPosition[2],
            halfWorld - adtPosition[0], adtPosition[1]] });
      }
    }
  }
  const unique = [...new Map(matching.map((record) =>
    [`${record.kind}:${record.uniqueId}`, record])).values()];
  const exactRepair = unique.filter(({ names, selectedSet }) =>
    [...names, selectedSet ?? ""].some((value) => /repair|rugged/i.test(value)));
  const output = { source: { product: storage.getProductInfo().codeName,
    build, mapId: 2991, wdtFileDataId: layer.source.wdtFileDataId },
  ...counts, inspectedModels: models.size,
  worldModelIds: [...models.keys()].filter((key) => key.startsWith("world-model:"))
    .map((key) => Number(key.split(":")[1])).sort((a, b) => a - b),
  doodadModelIds: [...models.keys()].filter((key) => key.startsWith("doodad:"))
    .map((key) => Number(key.split(":")[1])).sort((a, b) => a - b),
  matchingPlacements: unique, exactRepairPlacements: exactRepair };
  await writeFile(join(root, "data/client-research/zephras-repair-model-trace.json"),
    `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Zephras: ${counts.objectAdts} ADTs, ${models.size} distinct models, ${unique.length} smith/repair-related placements, ${exactRepair.length} explicitly repair-named.`);
  console.log(exactRepair.map(({ kind, fileDataId, uniqueId, names }) =>
    `${kind} ${fileDataId} ${uniqueId}: ${names.join(", ")}`).join("\n"));
} finally {
  storage.close();
}
