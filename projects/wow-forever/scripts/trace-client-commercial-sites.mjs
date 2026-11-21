/** Trace placed commercial WMO groups as repair-vendor research candidates. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const atlas = JSON.parse(await readFile(join(root,
  "public/maps/world-atlas/metadata.json"), "utf8"));
const maps = atlas.terrainLayers.map(({ source }) => source)
  .filter(({ mapId }) => [0, 1, 2991].includes(mapId));
const project = createClientWorldProjector(atlas);
const terms = /repair|smith|armou?r|weapon|dealer|shop|merchant|vendor|goods|suppl|outfitter|leather|tailor|forge|anvil|market|tradeskill|workshop/i;
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
  const uniquePlacements = new Map();
  const mapAdtCounts = {};
  for (const { mapId, wdtFileDataId } of maps) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).find(({ name }) => name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`Invalid WDT ${wdtFileDataId}.`);
    mapAdtCounts[mapId] = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!adtFileDataId) continue;
      mapAdtCounts[mapId] += 1;
      const bytes = storage.readFile(fileName(adtFileDataId));
      const modf = chunksOf(bytes).find(({ name }) => name === "MODF");
      if (!modf || modf.size % 64) throw new Error(`Invalid MODF in ${adtFileDataId}.`);
      for (let offset = modf.offset; offset < modf.offset + modf.size; offset += 64) {
        const uniqueId = bytes.readUInt32LE(offset + 4);
        const key = `${mapId}:${uniqueId}`;
        const adtPosition = [8, 12, 16].map((delta) => bytes.readFloatLE(offset + delta));
        const halfWorld = 32 * (1600 / 3);
        const placement = { mapId, uniqueId,
          modelFileDataId: bytes.readUInt32LE(offset), adtFileDataId,
          worldPosition: [halfWorld - adtPosition[2],
            halfWorld - adtPosition[0], adtPosition[1]],
          yawDegrees: bytes.readFloatLE(offset + 24),
          doodadSetIndex: bytes.readUInt16LE(offset + 58) };
        const existing = uniquePlacements.get(key);
        if (existing && (existing.modelFileDataId !== placement.modelFileDataId
          || existing.worldPosition.some((value, axis) => value !== placement.worldPosition[axis]))) {
          throw new Error(`Conflicting repeated placement ${key}.`);
        }
        if (!existing) uniquePlacements.set(key, placement);
      }
    }
  }
  const models = new Map();
  for (const { modelFileDataId } of uniquePlacements.values()) {
    if (models.has(modelFileDataId)) continue;
    const bytes = storage.readFile(fileName(modelFileDataId));
    const chunks = chunksOf(bytes);
    const mogn = chunks.find(({ name }) => name === "MOGN");
    const mogi = chunks.find(({ name }) => name === "MOGI");
    const mohd = chunks.find(({ name }) => name === "MOHD");
    const gfid = chunks.find(({ name }) => name === "GFID");
    const mods = chunks.find(({ name }) => name === "MODS");
    if (!mogn || !mogi || !mohd || !gfid || !mods || mogi.size % 32 || mods.size % 32) {
      throw new Error(`Incomplete WMO directory ${modelFileDataId}.`);
    }
    const groupCount = bytes.readUInt32LE(mohd.offset + 4);
    const fileStride = gfid.size / groupCount;
    if (groupCount !== mogi.size / 32 || ![4, 8, 12, 16].includes(fileStride)) {
      throw new Error(`Invalid group count ${modelFileDataId}.`);
    }
    const allNames = bytes.subarray(mogn.offset, mogn.offset + mogn.size)
      .toString("latin1").split("\0");
    const sets = [];
    for (let at = mods.offset; at < mods.offset + mods.size; at += 32) {
      sets.push(bytes.toString("latin1", at, at + 20).split("\0")[0]);
    }
    if (!allNames.some((name) => terms.test(name))
      && !sets.some((name) => terms.test(name))) {
      models.set(modelFileDataId, { sets, groups: [] });
      continue;
    }
    const groups = [];
    for (let index = 0; index < groupCount; index += 1) {
      const groupFileDataId = Array.from({ length: fileStride / 4 }, (_, slot) =>
        bytes.readUInt32LE(gfid.offset + (slot * groupCount + index) * 4))
        .find(Boolean);
      if (!groupFileDataId) continue;
      const groupBytes = storage.readFile(fileName(groupFileDataId));
      const mogp = chunksOf(groupBytes).find(({ name }) => name === "MOGP");
      if (!mogp) throw new Error(`Missing WMO group ${groupFileDataId}.`);
      const names = [0, 4].map((delta) => {
        const nameOffset = groupBytes.readUInt32LE(mogp.offset + delta);
        if (nameOffset >= mogn.size) throw new Error(`Invalid group name in ${groupFileDataId}.`);
        const start = mogn.offset + nameOffset;
        const end = bytes.indexOf(0, start);
        if (end < 0 || end > mogn.offset + mogn.size) {
          throw new Error(`Unterminated group name in ${groupFileDataId}.`);
        }
        return bytes.toString("utf8", start, end);
      });
      if (!names.some((name) => terms.test(name))) continue;
      const at = mogi.offset + index * 32;
      const min = [0, 4, 8].map((delta) => bytes.readFloatLE(at + 4 + delta));
      const max = [0, 4, 8].map((delta) => bytes.readFloatLE(at + 16 + delta));
      groups.push({ index, groupFileDataId, names,
        center: min.map((value, axis) => (value + max[axis]) / 2) });
    }
    models.set(modelFileDataId, { sets, groups });
  }
  const candidates = [];
  for (const placement of uniquePlacements.values()) {
    const model = models.get(placement.modelFileDataId);
    const selectedSet = model.sets[placement.doodadSetIndex] ?? null;
    const setMatches = terms.test(selectedSet ?? "");
    if (!setMatches && model.groups.length === 0) continue;
    const groups = model.groups.map((group) => {
      const angle = placement.yawDegrees * Math.PI / 180;
      const [x, y, z] = group.center;
      const worldPosition = [
        placement.worldPosition[0] - (Math.cos(angle) * x - Math.sin(angle) * y),
        placement.worldPosition[1] - (Math.sin(angle) * x + Math.cos(angle) * y),
        placement.worldPosition[2] + z,
      ];
      return { ...group, worldPosition,
        atlasPosition: project(placement.mapId, worldPosition) };
    });
    candidates.push({ ...placement, selectedSet, setMatches, groups,
      atlasPosition: project(placement.mapId, placement.worldPosition) });
  }
  const report = { source: { product: storage.getProductInfo().codeName, build },
    caveat: "Commercial group geometry and decoration sets locate venues, not NPCs or repair-service flags.",
    mapAdtCounts, allWorldPlacements: uniquePlacements.size,
    distinctWorldModels: models.size, candidatePlacements: candidates.length,
    candidates };
  await writeFile(join(root, "data/client-research/commercial-site-candidates.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Mapped ${candidates.length} commercial-looking WMO placements from ${uniquePlacements.size} placed structures across ${Object.keys(mapAdtCounts).length} maps.`);
  console.log(`Repair-named groups or selected sets: ${candidates.flatMap((placement) =>
    placement.groups.map((group) => group.names).concat([[placement.selectedSet]]))
    .filter((names) => names.some((name) => /repair/i.test(name ?? ""))).length}.`);
} finally {
  storage.close();
}
