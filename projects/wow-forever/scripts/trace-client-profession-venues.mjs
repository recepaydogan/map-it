/** Trace profession-related places in all positioned client records and world ADTs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const [survey, areaPois, modelClues, profile, atlas, trainerAudit] = await Promise.all([
  readJson("data/client-research/map-placement-survey.json"),
  readJson("data/client-research/area-poi-category-profile.json"),
  readJson("data/client-research/adt-service-model-clues.json"),
  readJson("data/client-research/adt-placement-profile.json"),
  readJson("public/maps/world-atlas/metadata.json"),
  readJson("data/client-research/profession-trainer-audit.json"),
]);
const professionNames = new Set(trainerAudit.professions.map(({ name }) => name));
const namedVenues = new Map([
  ["Dawnstrider Enchanters", "Enchanting"],
  ["Bena's Alchemy", "Alchemy"],
  ["Holistic Herbalism", "Herbalism"],
  ["Karn's Smithy", "Blacksmithing"],
  ["Stonehoof Geology", "Mining"],
  ["Mountaintop Bait & Tackle", "Fishing"],
  ["Aska's Kitchen", "Cooking"],
  ["Leather Work", "Leatherworking"],
  ["Herbalist", "Herbalism"],
  ["Tailoring", "Tailoring"],
  ["Cooking Trainer", "Cooking"],
  ["Swiftdrought Alchemy", "Alchemy"],
  ["Fairweather Fishing", "Fishing"],
  ["The Agronomical Apothecary", "Alchemy"],
  ["Simply Enchanting", "Enchanting"],
  ["First to Your Aid", "First Aid"],
  ["Talismanic Textiles", "Tailoring"],
  ["The Undaunted Feast", "Cooking"],
  ["Engineer and Far", "Engineering"],
  ["Eclipse with Shears", "Leatherworking"],
]);
const candidateNamePattern = /\b(?:alchemy|alchemist|apothecary|herbal(?:ist|ism)?|enchant(?:er|ers|ing)?|tailor(?:ing)?|textiles|leather(?:worker|working| work)?|blacksmith|smithy|fishing|fisher|bait|tackle|cooking|cook|kitchen|mining|miner|geology|skinning|skinner|engineer(?:ing)?|first aid|shears|trainer)\b/i;
const worldModelPattern = /(?:^|[\\/_])(?:shop_(?:firstaid|tailoring|enchanting)|interior_alchemy|set_house_fishing|rvg_(?:enchanter|blacksmith)|blacksmithinterior|blacksmithexterior|alchemist(?:ext|int)|miningint)/i;
const doodadPattern = /(?:tradeskill_(?:firstaid|enchanting|skinning|alchemy|anvil)|engineering_autolathe|crate(?:alliance|horde)firstaid|blacksmithforge)/i;
const selectedModels = modelClues.candidates.filter(({ kind, matchingStrings }) =>
  matchingStrings.some((value) => (kind === "world-model" ? worldModelPattern : doodadPattern).test(value)));
const modelById = new Map(selectedModels.map((record) => [record.fileDataId, record]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const chunksOf = (bytes) => {
  const chunks = new Map();
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed ADT chunk at ${offset}.`);
    const name = bytes.toString("latin1", offset, offset + 4).split("").reverse().join("");
    chunks.set(name, { offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if ([survey.source.build, areaPois.source.build, modelClues.source.build,
    profile.source.build, atlas.source.build, trainerAudit.source.build]
    .some((candidate) => candidate !== build)) {
    throw new Error("The positioned sources belong to different client builds.");
  }
  const project = createClientWorldProjector(atlas);
  const placedObjects = survey.maps.flatMap(({ mapId, gameObjects }) => gameObjects
    .filter(({ name }) => namedVenues.has(name))
    .map(({ objectId, name, worldPosition, displayId }) => ({
      sourceType: "placed-game-object", sourceId: objectId, name,
      profession: namedVenues.get(name), mapId, worldPosition,
      atlasPosition: project(mapId, worldPosition), displayId,
      evidence: "A positioned, named object. Its name may be a shop or wayfinding sign.",
    })));
  const namedAreaPois = areaPois.groups.flatMap(({ records }) => records
    .filter(({ name }) => namedVenues.has(name))
    .map(({ poiId, name, mapId, worldPosition, atlasPosition }) => ({
      sourceType: "area-poi", sourceId: poiId, name,
      profession: namedVenues.get(name), mapId, worldPosition, atlasPosition,
      evidence: "A positioned, named map POI for a venue.",
    })));
  const unclassifiedNames = [
    ...survey.maps.flatMap(({ mapId, gameObjects }) => gameObjects
      .filter(({ name }) => name && candidateNamePattern.test(name) && !namedVenues.has(name))
      .map(({ objectId, name, worldPosition }) => ({ sourceType: "placed-game-object",
        sourceId: objectId, name, mapId, worldPosition }))),
    ...areaPois.groups.flatMap(({ records }) => records
      .filter(({ name }) => candidateNamePattern.test(name) && !namedVenues.has(name))
      .map(({ poiId, name, mapId, worldPosition }) => ({ sourceType: "area-poi",
        sourceId: poiId, name, mapId, worldPosition }))),
  ];
  const misplacedNames = [...namedVenues.keys()].filter((name) =>
    ![...placedObjects, ...namedAreaPois].some((record) => record.name === name));
  if (misplacedNames.length || [...placedObjects, ...namedAreaPois]
    .some(({ profession }) => !professionNames.has(profession))) {
    throw new Error(`The named profession venue inventory changed: ${misplacedNames.join(", ")}`);
  }
  const terrainModels = [];
  const observedCounts = new Map();
  for (const { mapId, wdtFileDataId } of [
    { mapId: 1, wdtFileDataId: 782779 },
    { mapId: 0, wdtFileDataId: 775971 },
  ]) {
    const wdt = storage.readFile(fileName(wdtFileDataId));
    const maid = chunksOf(wdt).get("MAID");
    if (maid?.size !== 64 * 64 * 32) throw new Error(`WDT ${wdtFileDataId} lacks MAID.`);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const adtFileDataId = wdt.readUInt32LE(maid.offset + (y * 64 + x) * 32 + 4);
      if (!adtFileDataId) continue;
      const adt = storage.readFile(fileName(adtFileDataId));
      const chunks = chunksOf(adt);
      for (const { chunkName, recordSize, kind } of [
        { chunkName: "MDDF", recordSize: 36, kind: "doodad" },
        { chunkName: "MODF", recordSize: 64, kind: "world-model" },
      ]) {
        const chunk = chunks.get(chunkName);
        if (!chunk || chunk.size % recordSize) {
          throw new Error(`Object ADT ${adtFileDataId} has invalid ${chunkName}.`);
        }
        for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += recordSize) {
          const modelFileDataId = adt.readUInt32LE(offset);
          const model = modelById.get(modelFileDataId);
          if (!model || model.kind !== kind) continue;
          const position = [8, 12, 16].map((delta) => adt.readFloatLE(offset + delta));
          const halfWorld = 32 * 1600 / 3;
          const worldPosition = [halfWorld - position[2],
            halfWorld - position[0], position[1]];
          const projectedTile = { x: Math.floor(position[0] / (1600 / 3)),
            y: Math.floor(position[2] / (1600 / 3)) };
          if (Math.abs(projectedTile.x - x) > 1 || Math.abs(projectedTile.y - y) > 1) {
            throw new Error(`Model ${modelFileDataId} does not match ADT cell ${x},${y}.`);
          }
          const atlasPosition = project(mapId, worldPosition);
          if (!atlasPosition) throw new Error(`Cannot project model ${modelFileDataId}.`);
          observedCounts.set(modelFileDataId, (observedCounts.get(modelFileDataId) ?? 0) + 1);
          terrainModels.push({ sourceType: "static-terrain-model", kind, modelFileDataId,
            modelNameHints: model.matchingStrings, mapId, wdtFileDataId,
            adtFileDataId, adtCell: { x, y }, uniqueId: adt.readUInt32LE(offset + 4),
            worldPosition, atlasPosition,
            evidence: "Static artwork only. A model can contain several inactive profession-themed doodad sets.",
          });
        }
      }
    }
  }
  for (const model of selectedModels) {
    if (observedCounts.get(model.fileDataId) !== model.placements) {
      throw new Error(`Model ${model.fileDataId} placement count changed.`);
    }
  }
  const distinctModelLocations = new Set(terrainModels.map(({ mapId,
    modelFileDataId, worldPosition }) => [mapId, modelFileDataId,
    ...worldPosition.map((value) => value.toFixed(2))].join(":"))).size;
  const report = {
    source: { product: storage.getProductInfo().codeName, build,
      areaPoi: { fileDataId: areaPois.source.fileDataId,
        sha256: areaPois.source.sha256 },
      gameObjects: survey.source.tables.find(({ name }) => name === "GameObjects"),
      worldAdts: profile.maps.map(({ mapId, wdtFileDataId, wdtSha256 }) =>
        ({ mapId, wdtFileDataId, wdtSha256 })),
      modelClueFileSha256: sha256(await readFile(join(root,
        "data/client-research/adt-service-model-clues.json"))) },
    classification: "Named objects and POIs locate profession venues or wayfinding signs. Static ADT models locate profession-themed artwork. None proves a trainer's identity, interaction, rank, or exact standing point.",
    counts: { namedPlacedObjects: placedObjects.length,
      namedAreaPois: namedAreaPois.length,
      unclassifiedNameCandidates: unclassifiedNames.length,
      professionModelTypes: selectedModels.length,
      professionModelPlacements: terrainModels.length,
      distinctModelLocations },
    namedPlacedObjects: placedObjects,
    namedAreaPois,
    unclassifiedNameCandidates: unclassifiedNames,
    professionModelTypes: selectedModels.map(({ kind, fileDataId, placements,
      matchingStrings, sha256: hash }) => ({ kind, fileDataId, placements,
      matchingStrings, sha256: hash })),
    professionModelPlacements: terrainModels,
  };
  await writeFile(join(root, "data/client-research/profession-venue-trace.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Found ${placedObjects.length} named placed objects, ${namedAreaPois.length} named AreaPOIs, and ${terrainModels.length} profession-themed terrain model placements across ${selectedModels.length} model types.`);
} finally {
  storage.close();
}
