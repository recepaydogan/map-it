/** Trace placed mailbox/chest scenery against game-object display records. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const profile = await readJson("data/client-research/adt-placement-profile.json");
const models = await readJson("data/client-research/adt-service-model-clues.json");
const placedServices = await readJson("data/client-research/placed-service-model-clues.json");
const placedContainers = await readJson("data/client-research/placed-container-model-clues.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const target = models.candidates.filter(({ kind, matchingStrings }) =>
  kind === "doodad" && matchingStrings.some((value) => /mailbox|chest|coffer|treasure/i.test(value)));
const targetIds = new Set(target.map(({ fileDataId }) => fileDataId));
const displayTable = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
if (!displayTable) throw new Error("Missing GameObjectDisplayInfo.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed chunk at ${offset}.`);
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4).split("").reverse().join(""),
      offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
try {
  const build = storage.getProductInfo().buildNumber;
  if (atlas.source.build !== build || profile.source.build !== build || models.source.build !== build
    || placedServices.source.build !== build || placedContainers.source.build !== build
    || placedServices.source.gameObjects.sha256 !== placedContainers.source.gameObjects.sha256) {
    throw new Error("ADT, atlas, and local game builds differ.");
  }
  const displayBytes = storage.readFile(fileName(displayTable.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(displayBytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== displayTable.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed.");
  }
  const displayIds = new Map([...targetIds].map((id) => [id, []]));
  for (const displayId of reader.getAllIDs()) {
    const row = reader.getRowData(displayId);
    const modelFileDataId = row?.[1]?.data;
    if (displayIds.has(modelFileDataId)) displayIds.get(modelFileDataId).push(displayId);
  }
  const project = createClientWorldProjector(atlas);
  const placements = [];
  for (const { mapId, wdtFileDataId } of [
    { mapId: 1, wdtFileDataId: 782779 }, { mapId: 0, wdtFileDataId: 775971 },
  ]) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`WDT ${wdtFileDataId} lacks MAID.`);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!adtFileDataId) continue;
      const bytes = storage.readFile(fileName(adtFileDataId));
      const mddf = chunksOf(bytes).find(({ name }) => name === "MDDF");
      if (!mddf || mddf.size % 36) throw new Error(`Object ADT ${adtFileDataId} lacks valid MDDF.`);
      for (let offset = mddf.offset; offset < mddf.offset + mddf.size; offset += 36) {
        const modelFileDataId = bytes.readUInt32LE(offset);
        if (!targetIds.has(modelFileDataId)) continue;
        const adtPosition = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
        const halfWorld = 32 * (1600 / 3);
        const worldPosition = [halfWorld - adtPosition[2],
          halfWorld - adtPosition[0], adtPosition[1]];
        const projectedTile = {
          x: Math.floor(adtPosition[0] / (1600 / 3)),
          y: Math.floor(adtPosition[2] / (1600 / 3)),
        };
        placements.push({ mapId, wdtFileDataId, adtFileDataId, adtCell: { x, y },
          modelFileDataId, uniqueId: bytes.readUInt32LE(offset + 4),
          adtPosition, worldPosition,
          projectedTile, matchesAdtCell: Math.abs(projectedTile.x - x) <= 1
            && Math.abs(projectedTile.y - y) <= 1,
          atlasPosition: project(mapId, worldPosition) });
      }
    }
  }
  const report = { source: { product: storage.getProductInfo().codeName, build,
    gameObjects: placedServices.source.gameObjects,
    displayInfo: { fileDataId: displayTable.fileDataId,
      sha256: createHash("sha256").update(displayBytes).digest("hex"), omittedSections } },
  caveat: "Static ADT models are scenery. Even a GameObjectDisplayInfo model match cannot establish an interactive mailbox, loot chest, or Battered Chest spawn.",
  models: target.map(({ fileDataId, placements: expected, matchingStrings, sha256 }) => ({
    fileDataId, expectedPlacements: expected, matchingStrings, sha256,
    gameObjectDisplayIds: displayIds.get(fileDataId),
    clientPlacedObjectIds: [...placedServices.records, ...placedContainers.records]
      .filter(({ modelFileDataId }) => modelFileDataId === fileDataId)
      .map(({ objectId }) => objectId) })), placements };
  for (const model of report.models) {
    if (placements.filter(({ modelFileDataId }) => modelFileDataId === model.fileDataId).length
      !== model.expectedPlacements) throw new Error(`Model ${model.fileDataId} placement count changed.`);
  }
  if (placements.some(({ matchesAdtCell, atlasPosition }) => !matchesAdtCell || !atlasPosition)) {
    throw new Error("An ADT mailbox or chest placement could not be projected onto its native world map.");
  }
  await writeFile(join(root, "data/client-research/adt-mailbox-chest-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Traced ${target.length} mailbox/chest models and ${placements.length} placements; `
    + `${placements.filter(({ matchesAdtCell }) => !matchesAdtCell).length} cell mismatches.`);
  console.log(report.models.map(({ fileDataId, expectedPlacements, matchingStrings, gameObjectDisplayIds }) =>
    `${fileDataId} ×${expectedPlacements}: ${matchingStrings.join(", ")}; display rows: ${gameObjectDisplayIds.join(",") || "none"}`).join("\n"));
} finally { storage.close(); }
