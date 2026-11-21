/** Inspect named bank groups and local bounds inside placed world models. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const trace = JSON.parse(await readFile(join(root,
  "data/client-research/bank-building-placement-trace.json"), "utf8"));
const atlas = JSON.parse(await readFile(join(root,
  "public/maps/world-atlas/metadata.json"), "utf8"));
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
  if (build !== trace.source.build || build !== atlas.source.build) {
    throw new Error("Installed game build changed.");
  }
  const project = createClientWorldProjector(atlas);
  const byModel = new Map();
  for (const { fileDataId } of trace.placements) {
    if (byModel.has(fileDataId)) continue;
    const bytes = storage.readFile(fileName(fileDataId));
    const chunks = chunksOf(bytes);
    const mogi = chunks.find(({ name }) => name === "MOGI");
    const mogn = chunks.find(({ name }) => name === "MOGN");
    const mohd = chunks.find(({ name }) => name === "MOHD");
    const gfid = chunks.find(({ name }) => name === "GFID");
    const mods = chunks.find(({ name }) => name === "MODS");
    if (!mogi || !mogn || !mohd || !gfid || !mods
      || mogi.size % 32 || mods.size % 32) {
      throw new Error(`World model ${fileDataId} has no valid group directory.`);
    }
    const groupCount = bytes.readUInt32LE(mohd.offset + 4);
    const groupFileStride = gfid.size / groupCount;
    if (groupCount !== mogi.size / 32
      || ![4, 16].includes(groupFileStride)) {
      throw new Error(`World model ${fileDataId} has mismatched group counts.`);
    }
    const groups = [];
    for (let index = 0; index < groupCount; index += 1) {
      const offset = mogi.offset + index * 32;
      const groupFileDataId = Array.from({ length: groupFileStride / 4 }, (_, slot) =>
        bytes.readUInt32LE(gfid.offset + (slot * groupCount + index) * 4))
        .find((id) => id !== 0);
      if (!groupFileDataId) continue;
      const groupBytes = storage.readFile(fileName(groupFileDataId));
      const mogp = chunksOf(groupBytes).find(({ name }) => name === "MOGP");
      if (!mogp) throw new Error(`Missing group header ${groupFileDataId}.`);
      const names = [0, 4].map((delta) => {
        const nameOffset = groupBytes.readUInt32LE(mogp.offset + delta);
        if (nameOffset >= mogn.size) {
          throw new Error(`Invalid group name offset in ${fileDataId}.`);
        }
        const end = bytes.indexOf(0, mogn.offset + nameOffset);
        if (end < 0 || end > mogn.offset + mogn.size) {
          throw new Error(`Unterminated group name in ${fileDataId}.`);
        }
        return bytes.toString("utf8", mogn.offset + nameOffset, end);
      });
      if (!names.some((name) => /bank|vault/i.test(name))) continue;
      const readVec = (at) => [0, 4, 8].map((delta) => bytes.readFloatLE(at + delta));
      const min = readVec(offset + 4);
      const max = readVec(offset + 16);
      groups.push({ index, groupFileDataId, names,
        flags: bytes.readUInt32LE(offset), min, max,
        center: min.map((value, axis) => (value + max[axis]) / 2) });
    }
    const doodadSets = [];
    for (let offset = mods.offset; offset < mods.offset + mods.size; offset += 32) {
      doodadSets.push(bytes.toString("latin1", offset, offset + 20).split("\0")[0]);
    }
    byModel.set(fileDataId, { fileDataId, groupCount, doodadSets, groups });
  }
  const placements = trace.placements.map((placement) => ({ ...placement,
    selectedDoodadSet: byModel.get(placement.fileDataId)
      .doodadSets[placement.doodadSetIndex],
    groups: byModel.get(placement.fileDataId).groups.map((group) => {
      const theta = placement.rotationDegrees[1] * Math.PI / 180;
      const [x, y, z] = group.center;
      const worldPosition = [
        placement.worldPosition[0] - (Math.cos(theta) * x - Math.sin(theta) * y),
        placement.worldPosition[1] - (Math.sin(theta) * x + Math.cos(theta) * y),
        placement.worldPosition[2] + z,
      ];
      return { ...group, worldPosition,
        atlasPosition: project(placement.mapId, worldPosition) };
    }) }));
  const report = { source: trace.source, caveat:
    "WMO bank/vault group bounds are local geometry. The placed model origin is not the bank position; group transforms and service evidence must be checked before publication.",
  models: [...byModel.values()], placements };
  await writeFile(join(root, "data/client-research/bank-wmo-group-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log([...byModel.values()].map(({ fileDataId, groupCount, groups }) =>
    `${fileDataId}: ${groups.length}/${groupCount} bank groups: ${groups.map(({ names, center }) => `${names.join("/")}@${center.map(Math.round).join(",")}`).join("; ")}`).join("\n"));
} finally {
  storage.close();
}
