/** Check whether service-themed WMO doodads are actually selected by world placements. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = JSON.parse(await readFile(join(root,
  "data/client-research/wmo-service-doodad-trace.json"), "utf8"));
const atlas = JSON.parse(await readFile(join(root,
  "public/maps/world-atlas/metadata.json"), "utf8"));
const maps = atlas.terrainLayers.map(({ source: layer }) => layer)
  .filter(({ mapId }) => [0, 1, 2991].includes(mapId));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
function chunksOf(bytes) {
  const chunks = new Map();
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed chunk at ${offset}.`);
    const name = bytes.toString("latin1", offset, offset + 4)
      .split("").reverse().join("");
    chunks.set(name, { offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
}

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== source.source.build || build !== atlas.source.build) {
    throw new Error("Installed game build changed.");
  }
  const placements = new Map();
  for (const { mapId, wdtFileDataId } of maps) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).get("MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`Invalid WDT ${wdtFileDataId}.`);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
      const id = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!id) continue;
      const bytes = storage.readFile(fileName(id));
      const modf = chunksOf(bytes).get("MODF");
      if (!modf || modf.size % 64) throw new Error(`Invalid MODF ${id}.`);
      for (let offset = modf.offset; offset < modf.offset + modf.size; offset += 64) {
        const record = { mapId, uniqueId: bytes.readUInt32LE(offset + 4),
          modelFileDataId: bytes.readUInt32LE(offset),
          doodadSetIndex: bytes.readUInt16LE(offset + 58) };
        const key = `${mapId}:${record.uniqueId}`;
        const previous = placements.get(key);
        if (previous && (previous.modelFileDataId !== record.modelFileDataId
          || previous.doodadSetIndex !== record.doodadSetIndex)) {
          throw new Error(`Conflicting world placement ${key}.`);
        }
        placements.set(key, record);
      }
    }
  }
  const byRoot = new Map();
  for (const placement of placements.values()) {
    const rows = byRoot.get(placement.modelFileDataId) ?? [];
    rows.push(placement);
    byRoot.set(placement.modelFileDataId, rows);
  }
  const records = [];
  for (const asset of source.matchingAssets) {
    const roots = [];
    for (const modelFileDataId of asset.worldModelFileDataIds) {
      const bytes = storage.readFile(fileName(modelFileDataId));
      const chunks = chunksOf(bytes);
      const modi = chunks.get("MODI");
      const modd = chunks.get("MODD");
      const mods = chunks.get("MODS");
      if (!modi || !modd || !mods || modi.size % 4 || modd.size % 40 || mods.size % 32) {
        throw new Error(`Invalid doodad directory ${modelFileDataId}.`);
      }
      const indices = new Set();
      for (let i = 0; i < modi.size / 4; i += 1) {
        if (bytes.readUInt32LE(modi.offset + i * 4) === asset.doodadFileDataId) indices.add(i);
      }
      const referencedRecords = [];
      for (let i = 0; i < modd.size / 40; i += 1) {
        const index = bytes.readUInt32LE(modd.offset + i * 40) & 0x00ff_ffff;
        if (indices.has(index)) referencedRecords.push(i);
      }
      const sets = [];
      for (let i = 0; i < mods.size / 32; i += 1) {
        const at = mods.offset + i * 32;
        const firstRecord = bytes.readUInt32LE(at + 20);
        const recordCount = bytes.readUInt32LE(at + 24);
        sets.push({ index: i,
          name: bytes.toString("latin1", at, at + 20).split("\0")[0],
          recordCount: referencedRecords.filter((n) => n >= firstRecord
            && n < firstRecord + recordCount).length });
      }
      const worldPlacements = byRoot.get(modelFileDataId) ?? [];
      const globalCount = /^\$?set_?\$?defaultglobal$|^defaultglobal$/i
        .test(sets[0]?.name ?? "") ? sets[0].recordCount : 0;
      const active = worldPlacements.filter(({ doodadSetIndex }) =>
        globalCount > 0 || (sets[doodadSetIndex]?.recordCount ?? 0) > 0);
      roots.push({ modelFileDataId, modelListIndices: indices.size,
        actualDoodadRecords: referencedRecords.length,
        worldPlacements: worldPlacements.length, activeWorldPlacements: active.length,
        activeByMap: Object.fromEntries([0, 1, 2991].map((mapId) =>
          [mapId, active.filter((placement) => placement.mapId === mapId).length])),
        selectedSets: [...new Set(worldPlacements.map(({ doodadSetIndex }) => doodadSetIndex))]
          .map((index) => sets[index] ?? { index, name: null, recordCount: 0 }) });
    }
    records.push({ doodadFileDataId: asset.doodadFileDataId, names: asset.names,
      roots, activeWorldPlacements: roots.reduce((sum, model) =>
        sum + model.activeWorldPlacements, 0) });
  }
  const activeAssets = records.filter((asset) => asset.activeWorldPlacements > 0);
  const report = { source: { product: storage.getProductInfo().codeName, build },
    caveat: "Placed equipment signs and props locate decoration, not repair-capable NPCs.",
    inspectedAssets: records.length, activeAssets: activeAssets.length,
    activeByMap: Object.fromEntries([0, 1, 2991].map((mapId) => [mapId,
      activeAssets.reduce((sum, asset) => sum + asset.roots.reduce((inner, model) =>
        inner + model.activeByMap[mapId], 0), 0)])),
    records };
  await writeFile(join(root, "data/client-research/active-service-doodad-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Active service/gear doodad assets: ${activeAssets.length}/${records.length}.`);
  console.log(`Active service/gear model placements by map: ${JSON.stringify(report.activeByMap)}.`);
  console.log(activeAssets.filter(({ names }) => names.some((name) => /sign/i.test(name)))
    .map(({ doodadFileDataId, names, roots }) => `${doodadFileDataId}: ${names.join(", ")} - ${roots.filter((model) => model.activeWorldPlacements).map((model) => `${model.modelFileDataId} (${model.activeWorldPlacements})`).join(", ")}`)
    .join("\n"));
} finally {
  storage.close();
}
