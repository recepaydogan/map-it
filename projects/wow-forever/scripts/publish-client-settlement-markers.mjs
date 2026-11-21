/** Publish named settlement areas only when local client map records locate them. */
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
const sounds = await readJson("data/client-research/named-sound-clues.json");
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const settlements = [
  { name: "Thunder Bluff", key: "thunderBluff", category: "city", regionId: "mulgore",
    texturePath: /^Interface\\WorldMap\\Mulgore_C60\\ThunderBluff[12]\.blp$/i,
    expectedTileCount: 2, minimumAmbientClues: 2 },
  { name: "Nijel's Point", key: "nijelsPoint", category: "town", regionId: "desolace",
    texturePath: /^Interface\\WorldMap\\Desolace_C60\\NijelsPoint1\.blp$/i,
    expectedTileCount: 1, minimumAmbientClues: 0 },
];
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const unpackFloats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Expected packed client floats.");
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`Missing local ${name} table.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed since the client inventory.`);
  }
  return { reader, source: { name, fileDataId: record.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber
    || sounds.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The atlas, ambient clues, and installed client differ in build.");
  }
  const paths = readTable("ManifestInterfaceData");
  const overlays = readTable("WorldMapOverlay");
  const tiles = readTable("WorldMapOverlayTile");
  const mapArts = readTable("UiMapArt");
  const artLayers = readTable("UiMapArtStyleLayer");
  const artLinks = readTable("UiMapXMapArt");
  const assignments = readTable("UiMapAssignment");
  const areaPois = readTable("AreaPOI");
  const published = settlements.map((settlement) => {
  const namedTiles = tiles.reader.getAllIDs().flatMap((id) => {
    const row = tiles.reader.getRowData(id);
    const textureFileDataId = row?.[3]?.data;
    const texturePathRow = paths.reader.getRowData(textureFileDataId);
    const path = `${texturePathRow?.[0]?.string ?? ""}${texturePathRow?.[1]?.string ?? ""}`;
    return settlement.texturePath.test(path)
      ? [{ id, overlayId: tiles.reader.getRowRelationship(id), textureFileDataId, path }]
      : [];
  });
  const overlayIds = [...new Set(namedTiles.map(({ overlayId }) => overlayId))];
  if (namedTiles.length !== settlement.expectedTileCount || overlayIds.length !== 1) {
    throw new Error(`${settlement.name} overlay textures lack one unique client placement.`);
  }
  const overlayId = overlayIds[0];
  const overlay = overlays.reader.getRowData(overlayId);
  if (!Array.isArray(overlay) || overlay[0]?.data !== overlayId) {
    throw new Error(`Missing ${settlement.name} overlay record.`);
  }
  const mapArtId = overlay[1].data;
  const mapArt = mapArts.reader.getRowData(mapArtId);
  if (!Array.isArray(mapArt)) throw new Error(`Missing ${settlement.name} map art.`);
  const styleId = mapArt[2].data;
  const matchingLayers = artLayers.reader.getAllIDs().filter((id) =>
    artLayers.reader.getRowRelationship(id) === styleId);
  if (matchingLayers.length !== 1) throw new Error(`${settlement.name} map art has ambiguous dimensions.`);
  const style = artLayers.reader.getRowData(matchingLayers[0]);
  const artWidth = style[1].data;
  const artHeight = style[2].data;
  const [width, height, left, top] = overlay.slice(2, 6).map(({ data }) => data);
  if (!(width > 0 && height > 0 && left >= 0 && top >= 0
    && left + width <= artWidth && top + height <= artHeight)) {
    throw new Error(`${settlement.name} overlay bounds exceed the client map art.`);
  }
  const matchingArtLinks = artLinks.reader.getAllIDs().filter((id) =>
    artLinks.reader.getRowData(id)?.[1]?.data === mapArtId);
  if (matchingArtLinks.length !== 1) throw new Error(`${settlement.name} art has ambiguous UI map links.`);
  const uiMapId = artLinks.reader.getRowRelationship(matchingArtLinks[0]);
  const matchingAssignments = assignments.reader.getAllIDs().filter((id) =>
    assignments.reader.getRowRelationship(id) === uiMapId);
  if (matchingAssignments.length !== 1) throw new Error(`${settlement.name} UI map has ambiguous world placement.`);
  const assignmentId = matchingAssignments[0];
  const assignment = assignments.reader.getRowData(assignmentId);
  const mapId = assignment[6].data;
  const uiMin = unpackFloats(assignment[0].data, 2);
  const uiMax = unpackFloats(assignment[1].data, 2);
  const worldRegion = unpackFloats(assignment[2].data, 6);
  if (mapId !== 1 || uiMin[0] >= uiMax[0] || uiMin[1] >= uiMax[1]
    || worldRegion[0] >= worldRegion[3] || worldRegion[1] >= worldRegion[4]) {
    throw new Error(`${settlement.name} UI map assignment is invalid or not on Kalimdor.`);
  }
  const uiPixelFromWorld = ([worldX, worldY]) => ({
    x: (uiMin[0] + (worldRegion[4] - worldY)
      / (worldRegion[4] - worldRegion[1]) * (uiMax[0] - uiMin[0])) * artWidth,
    y: (uiMin[1] + (worldRegion[3] - worldX)
      / (worldRegion[3] - worldRegion[0]) * (uiMax[1] - uiMin[1])) * artHeight,
  });
  const citySounds = sounds.records.filter(({ seedName }) => seedName === settlement.name);
  if (citySounds.length < settlement.minimumAmbientClues
    || citySounds.some(({ mapId: soundMapId, worldPosition }) => {
    if (soundMapId !== mapId) return true;
    const { x, y } = uiPixelFromWorld(worldPosition);
    return x < left || x > left + width || y < top || y > top + height;
  })) {
    throw new Error(`Named ${settlement.name} ambience conflicts with the overlay bounds.`);
  }
  const worldAtUiPixel = (pixelX, pixelY) => [
    worldRegion[3] - (pixelY / artHeight - uiMin[1]) / (uiMax[1] - uiMin[1])
      * (worldRegion[3] - worldRegion[0]),
    worldRegion[4] - (pixelX / artWidth - uiMin[0]) / (uiMax[0] - uiMin[0])
      * (worldRegion[4] - worldRegion[1]),
  ];
  const project = createClientWorldProjector(atlas);
  const overlayCenter = worldAtUiPixel(left + width / 2, top + height / 2);
  const corners = [[left, top], [left + width, top],
    [left, top + height], [left + width, top + height]]
    .map(([x, y]) => project(mapId, worldAtUiPixel(x, y)));
  if (corners.some((corner) => !corner)) throw new Error(`${settlement.name} area is outside the atlas.`);
  const atlasBounds = {
    minX: Math.min(...corners.map(({ x }) => x)),
    minY: Math.min(...corners.map(({ y }) => y)),
    maxX: Math.max(...corners.map(({ x }) => x)),
    maxY: Math.max(...corners.map(({ y }) => y)),
  };
  const namedPois = areaPois.reader.getAllIDs().flatMap((id) => {
    const row = areaPois.reader.getRowData(id);
    return row?.[0]?.string === settlement.name
      && areaPois.reader.getRowRelationship(id) === mapId
      ? [{ id, worldPosition: unpackFloats(row[3].data, 2) }] : [];
  });
  if (namedPois.length !== 1) {
    throw new Error(`${settlement.name} has no unique named AreaPOI on the world map.`);
  }
  const { id: areaPoiId, worldPosition } = namedPois[0];
  const atlasPosition = project(mapId, worldPosition);
  if (!atlasPosition || atlasPosition.x < atlasBounds.minX
    || atlasPosition.x > atlasBounds.maxX || atlasPosition.y < atlasBounds.minY
    || atlasPosition.y > atlasBounds.maxY) {
    throw new Error(`${settlement.name} AreaPOI lies outside its named map overlay.`);
  }
  const locationId = `client-world-map-overlay-${overlayId}`;
  return {
    location: { id: locationId, name: "", nameKey: `map.publishedPlaces.${settlement.key}.name`,
      category: settlement.category, label: "", subtype: settlement.category,
      regionId: settlement.regionId, region: "",
      regionKey: `map.publishedPlaces.${settlement.key}.region`,
      x: atlasPosition.x, y: atlasPosition.y },
    evidence: { locationId, name: settlement.name, category: settlement.category,
      placementRule: "Exact named client AreaPOI within its matching world-map overlay, not an NPC coordinate.",
      sourceIds: { overlayId, overlayTileIds: namedTiles.map(({ id }) => id),
        areaPoiId,
        textureFileDataIds: namedTiles.map(({ textureFileDataId }) => textureFileDataId),
        mapArtId, artStyleLayerId: matchingLayers[0], uiMapId,
        uiMapAssignmentId: assignmentId, worldMapId: mapId,
        corroboratingSoundEmitterIds: citySounds.map(({ id }) => id) },
      artBounds: { width: artWidth, height: artHeight },
      overlayBounds: { left, top, width, height },
      overlayCenter, worldPosition, atlasPosition, atlasBounds },
  };
  });
  await writeFile(join(root, "public/maps/world-atlas/locations-client.json"),
    `${JSON.stringify({ locations: published.map(({ location }) => location) }, null, 2)}\n`);
  await writeFile(join(root, "data/client-research/published-marker-evidence.json"),
    `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [paths, overlays, tiles, mapArts, artLayers, artLinks, assignments, areaPois]
      .map(({ source }) => source),
    namedSoundTable: sounds.source,
  }, markers: published.map(({ evidence }) => evidence) }, null, 2)}\n`);
  console.log(`Published ${published.length} client-verified settlement areas: ${published.map(({ evidence }) => evidence.name).join(", ")}.`);
} finally {
  storage.close();
}
