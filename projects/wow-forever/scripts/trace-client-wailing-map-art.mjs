/** Trace named Wailing Caverns map tiles through active client UI map records. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const overlay = await readJson("data/client-research/overlay-seed-links.json");
const named = overlay.links.find(({ seedName }) => seedName === "Wailing Caverns");
const expectedTiles = named?.assets.filter(({ path }) =>
  /^Interface\\WorldMap\\WailingCaverns\\WailingCaverns1_\d+\.blp$/i.test(path)) ?? [];
if (expectedTiles.length !== 12) throw new Error("Expected twelve named Wailing Caverns UI map tiles.");
const textureIds = new Set(expectedTiles.map(({ fileDataId }) => fileDataId));
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const summarize = (row) => Array.isArray(row) ? row.map((field, index) => ({ index,
  ...(typeof field.string === "string" ? { string: field.string } : {}),
  ...(field.data !== undefined ? { data: typeof field.data === "bigint"
    ? field.data.toString() : field.data } : {}),
})) : [];
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`No local ${name} registration.`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed in the local client.`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  if (catalog.source.build !== storage.getProductInfo().buildNumber
    || overlay.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The named map tiles and local client belong to different builds.");
  }
  const maps = readTable("Map");
  const uiMaps = readTable("UiMap");
  const assignments = readTable("UiMapAssignment");
  const artLinks = readTable("UiMapXMapArt");
  const mapArts = readTable("UiMapArt");
  const artTiles = readTable("UiMapArtTile");
  const map = maps.reader.getRowData(43);
  if (!Array.isArray(map) || map[1]?.string !== "Wailing Caverns") {
    throw new Error("Map 43 is not Wailing Caverns.");
  }
  const assignedUiMaps = assignments.reader.getAllIDs().flatMap((id) => {
    const row = assignments.reader.getRowData(id);
    return row?.[6]?.data === 43 ? [{ assignmentId: id,
      uiMapId: assignments.reader.getRowRelationship(id), fields: summarize(row) }] : [];
  });
  const assignedUiMapIds = new Set(assignedUiMaps.map(({ uiMapId }) => uiMapId));
  const namedUiMaps = uiMaps.reader.getAllIDs().flatMap((id) => {
    const row = uiMaps.reader.getRowData(id);
    return Array.isArray(row) && row.some(({ string }) =>
      typeof string === "string" && /wailing\s*caverns/i.test(string))
      ? [{ id, fields: summarize(row) }] : [];
  });
  const uiMapRows = [...assignedUiMapIds].map((id) => ({ id,
    fields: summarize(uiMaps.reader.getRowData(id)) }));
  const activeArtLinks = artLinks.reader.getAllIDs().flatMap((id) => {
    const uiMapId = artLinks.reader.getRowRelationship(id);
    if (!assignedUiMapIds.has(uiMapId)) return [];
    const row = artLinks.reader.getRowData(id);
    return [{ id, uiMapId, fields: summarize(row), artId: row?.[1]?.data ?? null }];
  });
  const namedTextureRows = artTiles.reader.getAllIDs().flatMap((id) => {
    const row = artTiles.reader.getRowData(id);
    if (!Array.isArray(row)) return [];
    const matchedFields = row.flatMap((field, index) =>
      textureIds.has(field?.data) ? [{ index, textureFileDataId: field.data }] : []);
    return matchedFields.length ? [{ id, relationshipId: artTiles.reader.getRowRelationship(id) ?? null,
      fields: summarize(row), matchedFields }] : [];
  });
  const relevantArtIds = new Set([...activeArtLinks.map(({ artId }) => artId),
    ...namedTextureRows.map(({ relationshipId }) => relationshipId)]);
  const relevantArtRows = [...relevantArtIds].filter(Number.isInteger).map((id) => ({
    id, fields: summarize(mapArts.reader.getRowData(id)) }));
  const wdtFileDataId = map[21]?.data ?? null;
  let wdtStatus;
  try {
    const bytes = storage.readFile(`FILE${wdtFileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const maidTiles = [];
    for (let offset = 0; offset + 8 <= bytes.length;) {
      const kind = bytes.subarray(offset, offset + 4).toString("ascii");
      const size = bytes.readUInt32LE(offset + 4);
      if (offset + 8 + size > bytes.length) throw new Error("Invalid Wailing Caverns WDT chunk.");
      if (kind === "DIAM" && size === 64 * 64 * 32) {
        const maid = bytes.subarray(offset + 8, offset + 8 + size);
        for (let index = 0; index < 64 * 64; index += 1) {
          const fileDataId = maid.readUInt32LE(index * 32 + 28);
          if (fileDataId) maidTiles.push({ x: index % 64,
            y: Math.floor(index / 64), fileDataId });
        }
      }
      offset += 8 + size;
    }
    wdtStatus = { available: true, byteLength: bytes.length,
      signature: bytes.subarray(0, 4).toString("ascii"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      nativeMinimapTileCount: maidTiles.length,
      nativeMinimapTiles: maidTiles.slice(0, 16) };
  } catch (error) {
    if (error?.codeName !== "ERROR_FILE_NOT_FOUND") throw error;
    wdtStatus = { available: false, reason: error.codeName };
  }
  await writeFile(join(root, "data/client-research/wailing-map-art-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: catalog.source.build,
      tables: [maps, uiMaps, assignments, artLinks, mapArts, artTiles]
        .map(({ source }) => source) },
    map: { id: 43, name: map[1].string, wdtFileDataId, wdtStatus },
    expectedTiles, assignedUiMaps, namedUiMaps, uiMapRows, activeArtLinks,
    artTileSample: artTiles.reader.getAllIDs().slice(0, 3).map((id) => ({ id,
      relationshipId: artTiles.reader.getRowRelationship(id) ?? null,
      fields: summarize(artTiles.reader.getRowData(id)) })),
    namedTextureRows, relevantArtRows,
    rule: "Named BLP paths are asset clues until their texture IDs join UiMapArtTile, UiMapArt, UiMapXMapArt, and a Map-43 UiMapAssignment." }, null, 2)}\n`);
  console.log(`Map 43: ${assignedUiMaps.length} UI assignments, ${activeArtLinks.length} active art links, ${namedTextureRows.length} named map-art tile joins.`);
} finally {
  storage.close();
}
