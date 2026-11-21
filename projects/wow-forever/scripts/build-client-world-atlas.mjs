/** Place locally extracted WDT minimaps on one canvas using client assignments. */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { WDCReader } from "@rhyster/wow-casc-dbc";
import { MAP_SOURCE } from "../src/features/map/map-registry.ts";

const projectRoot = new URL("../", import.meta.url);
const installDir = process.env.CASC_INSTALL_DIR ?? MAP_SOURCE.installDir;
const assignmentFileDataId = 1957219;
const assignmentLayoutHash = "c9cc8dfb";
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

const packedFloats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Expected packed DB2 float array.");
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};

const storage = new Storage();
storage.openEx(installDir, { codeName: MAP_SOURCE.product, region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const opened = storage.getProductInfo();
  if (opened.codeName !== MAP_SOURCE.product) throw new Error(`Opened ${opened.codeName}, expected ${MAP_SOURCE.product}.`);
  const assignmentBytes = storage.readFile(fileName(assignmentFileDataId));
  const assignments = new WDCReader(assignmentBytes);
  if (assignments.layoutHash.toString(16).padStart(8, "0") !== assignmentLayoutHash) {
    throw new Error("Client UiMapAssignment layout changed; update the atlas parser from game files.");
  }
  const layers = [];
  for (const continent of MAP_SOURCE.continents) {
    const assignmentId = assignments.getAllIDs().find((id) => {
      if (assignments.getRowRelationship(id) !== MAP_SOURCE.atlasUiMapId) return false;
      return assignments.getRowData(id)?.[6]?.data === continent.mapId;
    });
    if (assignmentId === undefined) throw new Error(`No world assignment for map ${continent.mapId}.`);
    const row = assignments.getRowData(assignmentId);
    const uiMin = packedFloats(row[0].data, 2);
    const uiMax = packedFloats(row[1].data, 2);
    const region = packedFloats(row[2].data, 6);
    if (!(uiMin[0] < uiMax[0] && uiMin[1] < uiMax[1]
      && region[0] < region[3] && region[1] < region[4])) {
      throw new Error(`Invalid client assignment ${assignmentId}.`);
    }
    const sourcePath = join(fileURLToPath(projectRoot), "public", "maps", `wdt-${continent.wdtFileDataId}`, "metadata.json");
    const source = JSON.parse(await readFile(sourcePath, "utf8"));
    if (source.source?.product !== MAP_SOURCE.product
      || source.source?.build !== opened.buildNumber
      || source.source?.wdtFileDataId !== continent.wdtFileDataId
      || !Array.isArray(source.tileCoverage)) {
      throw new Error(`Extracted WDT ${continent.wdtFileDataId} does not match this client build.`);
    }
    const tileSize = source.tileSize;
    const { minX, minY } = source.source.grid;
    const scaleX = ((uiMax[0] - uiMin[0]) * MAP_SOURCE.atlasWidth * MAP_SOURCE.adtWorldSize)
      / ((region[4] - region[1]) * tileSize);
    const scaleY = ((uiMax[1] - uiMin[1]) * MAP_SOURCE.atlasHeight * MAP_SOURCE.adtWorldSize)
      / ((region[3] - region[0]) * tileSize);
    const fullOriginX = uiMin[0] * MAP_SOURCE.atlasWidth
      + ((region[4] - 32 * MAP_SOURCE.adtWorldSize) / (region[4] - region[1]))
      * (uiMax[0] - uiMin[0]) * MAP_SOURCE.atlasWidth;
    const fullOriginY = uiMin[1] * MAP_SOURCE.atlasHeight
      + ((region[3] - 32 * MAP_SOURCE.adtWorldSize) / (region[3] - region[0]))
      * (uiMax[1] - uiMin[1]) * MAP_SOURCE.atlasHeight;
    layers.push({
      id: `map-${continent.mapId}`,
      basePath: `../wdt-${continent.wdtFileDataId}`,
      tilePattern: source.tilePattern,
      tileSize,
      detailLevels: source.detailLevels,
      tileCoverage: source.tileCoverage,
      sourceBounds: source.bounds,
      originX: fullOriginX + minX * tileSize * scaleX,
      originY: fullOriginY + minY * tileSize * scaleY,
      scaleX,
      scaleY,
      source: {
        mapId: continent.mapId,
        wdtFileDataId: continent.wdtFileDataId,
        uiMapAssignmentId: assignmentId,
        uiMapId: MAP_SOURCE.atlasUiMapId,
        uiMin,
        uiMax,
        worldRegion: region,
      },
    });
  }
  for (const inset of MAP_SOURCE.atlasInsets) {
    const sourcePath = join(fileURLToPath(projectRoot), "public", "maps",
      `wdt-${inset.wdtFileDataId}`, "metadata.json");
    const source = JSON.parse(await readFile(sourcePath, "utf8"));
    if (source.source?.product !== MAP_SOURCE.product
      || source.source?.build !== opened.buildNumber
      || source.source?.wdtFileDataId !== inset.wdtFileDataId
      || !Array.isArray(source.tileCoverage)
      || !Number.isInteger(source.source?.grid?.minX)
      || !Number.isInteger(source.source?.grid?.minY)) {
      throw new Error(`Extracted WDT ${inset.wdtFileDataId} does not match this client build.`);
    }
    layers.push({
      id: inset.id,
      labelKey: inset.labelKey,
      basePath: `../wdt-${inset.wdtFileDataId}`,
      tilePattern: source.tilePattern,
      tileSize: source.tileSize,
      detailLevels: source.detailLevels,
      tileCoverage: source.tileCoverage,
      sourceBounds: source.bounds,
      originX: inset.originX,
      originY: inset.originY,
      scaleX: inset.scale,
      scaleY: inset.scale,
      source: { mapId: inset.mapId, wdtFileDataId: inset.wdtFileDataId,
        placement: "overview-inset", grid: source.source.grid,
        adtWorldSize: MAP_SOURCE.adtWorldSize },
    });
  }
  const metadata = {
    schemaVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: MAP_SOURCE.atlasWidth, maxY: MAP_SOURCE.atlasHeight },
    tileSize: 512,
    detailLevels: [0],
    hideBaseTiles: true,
    backgroundColor: "#092634",
    regions: [],
    locations: [],
    terrainLayers: layers,
    source: {
      product: opened.codeName,
      build: opened.buildNumber,
      uiMapAssignmentFileDataId: assignmentFileDataId,
      uiMapAssignmentSha256: hash(assignmentBytes),
    },
  };
  const outputDir = new URL("../public/maps/world-atlas/", import.meta.url);
  await mkdir(outputDir, { recursive: true });
  await writeFile(new URL("metadata.json", outputDir), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Built one world atlas with ${layers.length} client terrain layers from build ${opened.buildNumber}.`);
} finally {
  storage.close();
}
