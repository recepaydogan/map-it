/** Search every placed GameObjects model for service and container asset names. */
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
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const servicePattern = /mailbox|guildvault|auction|barber|bank|stable|repair|vendor|merchant|trainer|innkeeper|generalgoods|alchemy|alchemist|herbal|enchant|tailor|leather|blacksmith|smithy|forge|anvil|fishing|fisher|fishmonger|cooking|cook|kitchen|mining|miner|geology|skinning|skinner|engineering|engineer|first.?aid|apothecary/i;
const containerPattern = /chest|coffer|cache|strongbox|lockbox|treasure|crate|barrel/i;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (atlas.source?.build !== build) throw new Error("The atlas and installed client differ in build.");
  const readTable = (name) => {
    const record = byName.get(name);
    if (!record) throw new Error(`Missing ${name} table registration.`);
    const bytes = storage.readFile(fileName(record.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
      throw new Error(`${name} layout differs from the local executable.`);
    }
    return { reader, source: { fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
  };
  const objects = readTable("GameObjects");
  const displays = readTable("GameObjectDisplayInfo");
  const project = createClientWorldProjector(atlas);
  const models = new Map();
  const records = [];
  const containerRecords = [];
  let placedObjects = 0;
  for (const objectId of objects.reader.getAllIDs()) {
    const row = objects.reader.getRowData(objectId);
    if (!Array.isArray(row)) continue;
    placedObjects += 1;
    const displayId = row[5]?.data;
    if (!models.has(displayId)) {
      const display = displays.reader.getRowData(displayId);
      if (!Array.isArray(display)) throw new Error(`Placed object ${objectId} lacks display ${displayId}.`);
      const modelFileDataId = display[1]?.data;
      if (!Number.isSafeInteger(modelFileDataId) || modelFileDataId <= 0) {
        throw new Error(`Display ${displayId} lacks a model file.`);
      }
      const model = storage.readFile(fileName(modelFileDataId));
      const embeddedNames = model.toString("latin1")
        .match(/[A-Za-z][A-Za-z0-9_/-]{5,}/g) ?? [];
      const modelNameHints = [...new Set(embeddedNames.filter((value) =>
        servicePattern.test(value)))].slice(0, 30);
      const containerNameHints = [...new Set(embeddedNames.filter((value) =>
        containerPattern.test(value)))].slice(0, 30);
      models.set(displayId, { modelFileDataId,
        modelSha256: createHash("sha256").update(model).digest("hex"),
        modelNameHints, containerNameHints });
    }
    const model = models.get(displayId);
    if (!model.modelNameHints.length && !model.containerNameHints.length) continue;
    const bytes = Buffer.alloc(12);
    for (let index = 0; index < 3; index += 1) {
      bytes.writeUInt32LE(Number((row[1].data >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
    }
    const worldPosition = [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
    const mapId = row[4].data;
    const placement = { objectId, name: row[0]?.string ?? "", mapId,
      worldPosition, atlasPosition: project(mapId, worldPosition),
      displayId, modelFileDataId: model.modelFileDataId,
      modelSha256: model.modelSha256 };
    if (model.modelNameHints.length) {
      records.push({ ...placement, modelNameHints: model.modelNameHints });
    }
    if (model.containerNameHints.length) {
      containerRecords.push({ ...placement, modelNameHints: model.containerNameHints });
    }
  }
  await writeFile(join(root, "data/client-research/placed-service-model-clues.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: objects.source, displayInfo: displays.source },
    placedObjects, distinctDisplayModels: models.size,
    caveat: "Embedded model-name strings identify asset artwork, not an active service, NPC, merchant inventory, or interactable object type.",
    records }, null, 2)}\n`);
  await writeFile(join(root, "data/client-research/placed-container-model-clues.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: objects.source, displayInfo: displays.source },
    placedObjects, distinctDisplayModels: models.size,
    caveat: "Embedded chest-like model names identify artwork, not a lootable object, loot table, or Battered Chest occurrence.",
    records: containerRecords }, null, 2)}\n`);
  console.log(`Found service-name model clues on ${records.length} of ${placedObjects} placed objects across ${models.size} display models.`);
  console.log(`Found container-name model clues on ${containerRecords.length} placed objects.`);
} finally {
  storage.close();
}
