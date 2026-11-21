/** Check whether positioned boat or dock scenery corroborates the Feathermoon transport node. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/adt-placement-profile.json");
const clues = await readJson("data/client-research/adt-service-model-clues.json");
const transport = await readJson("data/client-research/feathermoon-transport-clue.json");
const models = clues.candidates.filter(({ matchingStrings }) =>
  matchingStrings.some((value) => /boat|dock/i.test(value)));
const targetKeys = new Set(models.map(({ kind, fileDataId }) => `${kind}:${fileDataId}`));
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
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (profile.source.build !== build || clues.source.build !== build
    || transport.source.build !== build || transport.transport.mapId !== 1) {
    throw new Error("Feathermoon and ADT source builds differ.");
  }
  const counts = new Map();
  const nearFeathermoon = [];
  const anchors = [
    { name: "transport-node", worldPosition: transport.transport.worldPosition },
    { name: "stronghold-poi", worldPosition: transport.settlement.worldPosition },
  ];
  for (const { mapId, wdtFileDataId } of profile.maps) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`Invalid WDT ${wdtFileDataId}.`);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!adtFileDataId) continue;
      const bytes = storage.readFile(fileName(adtFileDataId));
      const chunks = chunksOf(bytes);
      for (const { kind, chunkName, stride } of [
        { kind: "doodad", chunkName: "MDDF", stride: 36 },
        { kind: "world-model", chunkName: "MODF", stride: 64 },
      ]) {
        const chunk = chunks.find(({ name }) => name === chunkName);
        if (!chunk || chunk.size % stride) {
          throw new Error(`Object ADT ${adtFileDataId} lacks ${chunkName}.`);
        }
        for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += stride) {
          const fileDataId = bytes.readUInt32LE(offset);
          const key = `${kind}:${fileDataId}`;
          if (!targetKeys.has(key)) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (mapId !== 1) continue;
          const adtPosition = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
          const halfWorld = 32 * (1600 / 3);
          const worldPosition = [halfWorld - adtPosition[2],
            halfWorld - adtPosition[0], adtPosition[1]];
          const distances = anchors.map(({ name, worldPosition: anchor }) => ({
            name, worldUnits: Math.hypot(worldPosition[0] - anchor[0],
              worldPosition[1] - anchor[1]),
          }));
          if (!distances.some(({ worldUnits }) => worldUnits <= 700)) continue;
          const model = models.find((record) => record.kind === kind
            && record.fileDataId === fileDataId);
          nearFeathermoon.push({ kind, fileDataId, modelStrings: model.matchingStrings,
            adtFileDataId, adtCell: { x, y }, uniqueId: bytes.readUInt32LE(offset + 4),
            worldPosition, distances,
            projectedTile: { x: Math.floor(adtPosition[0] / (1600 / 3)),
              y: Math.floor(adtPosition[2] / (1600 / 3)) } });
        }
      }
    }
  }
  for (const model of models) {
    const count = counts.get(`${model.kind}:${model.fileDataId}`) ?? 0;
    if (count !== model.placements) {
      throw new Error(`ADT placements changed for ${model.kind} ${model.fileDataId}.`);
    }
  }
  if (nearFeathermoon.some(({ adtCell, projectedTile }) =>
    Math.abs(adtCell.x - projectedTile.x) > 1
    || Math.abs(adtCell.y - projectedTile.y) > 1)) {
    throw new Error("Near-Feathermoon scenery does not project onto its ADT cells.");
  }
  nearFeathermoon.sort((a, b) => Math.min(...a.distances.map(({ worldUnits }) => worldUnits))
    - Math.min(...b.distances.map(({ worldUnits }) => worldUnits)));
  await writeFile(join(root, "data/client-research/feathermoon-scenery-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      worldObjectAdts: profile.maps, transportTaxiNodes: transport.source.taxiNodes },
    searchRadiusWorldUnits: 700,
    rule: "Static boat and dock scenery can corroborate geography, but cannot identify an active boat, boarding point, or transport destination.",
    inspectedModels: models.map(({ kind, fileDataId, placements, matchingStrings }) => ({
      kind, fileDataId, placements, matchingStrings })),
    nearFeathermoon }, null, 2)}\n`);
  console.log(`Traced ${models.length} boat/dock models; ${nearFeathermoon.length} placements within 700 world units of Feathermoon anchors.`);
} finally {
  storage.close();
}
