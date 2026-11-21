/** Locate static bank-like buildings on the local world ADTs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/adt-placement-profile.json");
const clues = await readJson("data/client-research/adt-service-model-clues.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const models = clues.candidates.filter(({ kind, matchingStrings }) => kind === "world-model"
  && matchingStrings.some((value) => /bank|vault/i.test(value)));
const byId = new Map(models.map((record) => [record.fileDataId, record]));
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
  if (build !== profile.source.build || build !== clues.source.build
    || build !== atlas.source.build) {
    throw new Error("The bank building audit and installed game have different builds.");
  }
  const project = createClientWorldProjector(atlas);
  const placements = [];
  for (const { mapId, wdtFileDataId } of profile.maps) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`Invalid WDT ${wdtFileDataId}.`);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!adtFileDataId) continue;
      const bytes = storage.readFile(fileName(adtFileDataId));
      const modf = chunksOf(bytes).find(({ name }) => name === "MODF");
      if (!modf || modf.size % 64) throw new Error(`Invalid MODF in ${adtFileDataId}.`);
      for (let offset = modf.offset; offset < modf.offset + modf.size; offset += 64) {
        const fileDataId = bytes.readUInt32LE(offset);
        const model = byId.get(fileDataId);
        if (!model) continue;
        const adtPosition = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
        const halfWorld = 32 * (1600 / 3);
        const worldPosition = [halfWorld - adtPosition[2],
          halfWorld - adtPosition[0], adtPosition[1]];
        placements.push({ mapId, adtFileDataId, adtCell: [x, y],
          uniqueId: bytes.readUInt32LE(offset + 4), fileDataId,
          modelStrings: model.matchingStrings.filter((value) => /bank|vault/i.test(value)),
          worldPosition,
          rotationDegrees: [20, 24, 28].map((delta) => bytes.readFloatLE(offset + delta)),
          doodadSetIndex: bytes.readUInt16LE(offset + 58),
          atlasPosition: project(mapId, worldPosition) });
      }
    }
  }
  for (const model of models) {
    const count = placements.filter(({ fileDataId }) => fileDataId === model.fileDataId).length;
    if (count !== model.placements) {
      throw new Error(`Placement count changed for bank model ${model.fileDataId}.`);
    }
  }
  const uniquePlacements = new Map();
  for (const placement of placements) {
    const key = `${placement.mapId}:${placement.uniqueId}`;
    const existing = uniquePlacements.get(key);
    if (!existing) {
      uniquePlacements.set(key, { ...placement, adtCells: [placement.adtCell] });
      continue;
    }
    if (existing.fileDataId !== placement.fileDataId
      || existing.worldPosition.some((value, index) =>
        value !== placement.worldPosition[index])
      || existing.rotationDegrees.some((value, index) =>
        value !== placement.rotationDegrees[index])
      || existing.doodadSetIndex !== placement.doodadSetIndex) {
      throw new Error(`Conflicting repeated world placement ${key}.`);
    }
    existing.adtCells.push(placement.adtCell);
  }
  const distinct = [...uniquePlacements.values()].map(({ adtCell, ...placement }) =>
    placement);
  distinct.sort((a, b) => a.mapId - b.mapId || a.fileDataId - b.fileDataId
    || a.uniqueId - b.uniqueId);
  await writeFile(join(root, "data/client-research/bank-building-placement-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build, worldObjectAdts: profile.maps },
    caveat: "These are static bank/vault-named world models. A model placement does not verify an interactive banker NPC, an open bank, or the building entrance.",
    modelCount: models.length, rawAdtRecordCount: placements.length,
    uniqueWorldPlacementCount: distinct.length, placements: distinct }, null, 2)}\n`);
  console.log(`Located ${distinct.length} unique bank/vault-named world-model placements across ${placements.length} ADT records and ${models.length} models.`);
  console.log(distinct.map(({ mapId, fileDataId, uniqueId, worldPosition }) =>
    `${mapId} ${fileDataId} ${uniqueId} ${worldPosition.slice(0, 2).map(Math.round).join(",")}`).join("\n"));
} finally {
  storage.close();
}
