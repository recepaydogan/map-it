/** Audit repair-vendor evidence in the installed game client only. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const tracking = await readJson("data/client-research/minimap-tracking-filters.json");
const placedModels = await readJson("data/client-research/world-object-model-family.json");
const staticModels = await readJson("data/client-research/adt-service-model-clues.json");
const project = createClientWorldProjector(atlas);
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed client chunk at ${offset}.`);
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4)
      .split("").reverse().join(""), offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
const spatialNames = new Set(["AreaPOI", "GameObjects", "Location", "UIMapPinInfo"]);
const npcNames = new Set(["Creature", "CreatureDifficulty", "GossipNPCOption",
  "CollectableSourceVendor", "CollectableSourceVendorSparse"]);
const registration = new Map(catalog.identified.map((table) => [table.name, table]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build || build !== atlas.source?.build
    || build !== tracking.source.build || build !== placedModels.source.build
    || build !== staticModels.source.build) {
    throw new Error("Repair audit sources belong to different game builds.");
  }
  const tables = [];
  const textHits = [];
  const placedRepairObjects = [];
  let decodedRows = 0;
  let encryptedRows = 0;
  for (const table of catalog.identified) {
    const fileName = `FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const bytes = storage.readFile(fileName);
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
      throw new Error(`Local ${table.name} layout changed.`);
    }
    const ids = reader.getAllIDs();
    decodedRows += ids.length;
    encryptedRows += omittedSections.reduce((sum, section) => sum + section.recordCount, 0);
    const tableHits = [];
    for (const id of ids) {
      const row = reader.getRowData(id);
      const strings = Array.isArray(row)
        ? row.flatMap((field, index) => typeof field?.string === "string" && field.string.trim()
          ? [{ fieldIndex: index, value: field.string }] : [])
        : row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
            .map((match) => ({ byteOffset: match.index, value: match[0] })) : [];
      for (const match of strings) {
        if (!/\brarc\b|\brepairs?\b/i.test(match.value)) continue;
        const hit = { table: table.name, fileDataId: table.fileDataId,
          rowId: id, ...match };
        tableHits.push(hit);
        textHits.push(hit);
      }
      if (table.name === "GameObjects" && Array.isArray(row)
        && /\brepairs?\b/i.test(row[0]?.string ?? "")) {
        const packed = Buffer.alloc(12);
        for (let index = 0; index < 3; index += 1) {
          packed.writeUInt32LE(Number((row[1].data >> BigInt(index * 32))
            & 0xffff_ffffn), index * 4);
        }
        const worldPosition = [0, 4, 8].map((offset) => packed.readFloatLE(offset));
        const mapId = row[4].data;
        const displayId = row[5].data;
        const model = placedModels.models?.find((entry) => entry.displayId === displayId)
          ?? placedModels.records?.find((entry) => entry.displayId === displayId);
        placedRepairObjects.push({ objectId: id, name: row[0].string,
          mapId, worldPosition, atlasPosition: project(mapId, worldPosition),
          displayId, modelFileDataId: model?.modelFileDataId ?? null,
          modelNameHints: model?.modelNameHints ?? [] });
      }
    }
    if (spatialNames.has(table.name) || npcNames.has(table.name) || tableHits.length) {
      tables.push({ name: table.name, fileDataId: table.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        decodedRows: ids.length,
        encryptedRows: omittedSections.reduce((sum, section) => sum + section.recordCount, 0),
        repairTextHits: tableHits.length });
    }
  }
  const repairFilter = tracking.values.find((value) => value.name === "Repair");
  if (repairFilter?.value !== 512) throw new Error("Native repair tracking type changed.");
  const worldObjectArchives = [];
  for (const { mapId, wdtFileDataId } of [
    { mapId: 1, wdtFileDataId: 782779 },
    { mapId: 0, wdtFileDataId: 775971 },
    { mapId: 2991, wdtFileDataId: 7198644 },
  ]) {
    const wdt = storage.readFile(`FILE${wdtFileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const maid = chunksOf(wdt).find((chunk) => chunk.name === "MAID");
    if (!maid || maid.size !== 64 * 64 * 32) throw new Error(`Map ${mapId} lacks MAID.`);
    const chunkCounts = new Map();
    const chunkBytes = new Map();
    const nonemptyChunks = new Map();
    const terrainChunkCounts = new Map();
    let referenced = 0;
    let available = 0;
    let missing = 0;
    for (let tile = 0; tile < 64 * 64; tile += 1) {
      const id = wdt.readUInt32LE(maid.offset + tile * 32 + 4);
      if (!id) continue;
      referenced += 1;
      const name = `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
      const info = storage.getFileInfo(name);
      if (!info || info.size === 0xffff_ffff) { missing += 1; continue; }
      available += 1;
      const bytes = storage.readFile(name);
      for (const chunk of chunksOf(bytes)) {
        chunkCounts.set(chunk.name, (chunkCounts.get(chunk.name) ?? 0) + 1);
        chunkBytes.set(chunk.name, (chunkBytes.get(chunk.name) ?? 0) + chunk.size);
        if (chunk.size) nonemptyChunks.set(chunk.name,
          (nonemptyChunks.get(chunk.name) ?? 0) + 1);
        if (chunk.name === "MCNK" && chunk.size) {
          for (const nested of chunksOf(bytes.subarray(chunk.offset, chunk.offset + chunk.size))) {
            terrainChunkCounts.set(nested.name, (terrainChunkCounts.get(nested.name) ?? 0) + 1);
          }
        }
      }
    }
    worldObjectArchives.push({ mapId, wdtFileDataId, referenced,
      available, missing, chunkCounts: Object.fromEntries([...chunkCounts].sort()),
      chunkBytes: Object.fromEntries([...chunkBytes].sort()),
      nonemptyChunks: Object.fromEntries([...nonemptyChunks].sort()),
      terrainChunkCounts: Object.fromEntries([...terrainChunkCounts].sort()) });
  }
  const output = {
    source: { product: storage.getProductInfo().codeName, build,
      localTableCount: catalog.identified.length },
    scope: "Installed game client only; no community map, website, or inferred NPC spawn coordinates.",
    decodedRows, encryptedRowsOmitted: encryptedRows,
    rarcTextHits: textHits.filter((hit) => /\brarc\b/i.test(hit.value)).length,
    repairTextHits: textHits.filter((hit) => /\brepairs?\b/i.test(hit.value)).length,
    repairTrackingFilter: repairFilter,
    registeredSpawnTables: catalog.identified.filter((table) =>
      /(?:creature|npc).*spawn|spawn.*(?:creature|npc)/i.test(table.name))
      .map(({ name, fileDataId }) => ({ name, fileDataId })),
    tables,
    textHits,
    placedRepairObjects,
    worldObjectArchives,
    placedStaticModelsScanned: staticModels.inspectedModels,
    placedStaticRepairModelHits: staticModels.candidates.filter((candidate) =>
      candidate.matchingStrings.some((value) => /\brepairs?\b/i.test(value)))
      .map(({ kind, fileDataId, placements, matchingStrings }) =>
        ({ kind, fileDataId, placements, matchingStrings })),
    conclusion: "No decoded client row joins a repair-capable NPC identity to a world position. Named repair GameObjects are scenery and do not establish an NPC service.",
  };
  await writeFile(join(root, "data/client-research/repair-vendor-client-audit.json"),
    `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Audited ${decodedRows} decoded rows in ${catalog.identified.length} client tables; ${encryptedRows} encrypted rows omitted.`);
  console.log(`${textHits.length} repair/Rarc text hits; ${placedRepairObjects.length} placed repair-named objects; ${output.registeredSpawnTables.length} registered NPC-spawn tables.`);
} finally {
  storage.close();
}
