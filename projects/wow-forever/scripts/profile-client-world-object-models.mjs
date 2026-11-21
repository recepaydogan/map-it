/** Inventory every placed world GameObject model before claiming marker semantics. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const survey = await readJson("data/client-research/map-placement-survey.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const table = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
if (!table) throw new Error("Missing GameObjectDisplayInfo registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (survey.source.build !== build || catalog.source.build !== build) {
    throw new Error("World object survey and local client builds differ.");
  }
  const bytes = storage.readFile(fileName(table.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed.");
  }
  const objects = survey.maps.filter(({ mapId }) => [0, 1].includes(mapId))
    .flatMap(({ mapId, gameObjects }) => gameObjects.map((object) => ({ ...object, mapId })));
  const byDisplayId = new Map();
  for (const object of objects) {
    const group = byDisplayId.get(object.displayId) ?? [];
    group.push(object);
    byDisplayId.set(object.displayId, group);
  }
  const models = [];
  for (const [displayId, placements] of [...byDisplayId].sort(([a], [b]) => a - b)) {
    const row = reader.getRowData(displayId);
    const modelFileDataId = row?.[1]?.data;
    if (!Number.isSafeInteger(modelFileDataId) || modelFileDataId <= 0) {
      throw new Error(`Missing placed world model for display ${displayId}.`);
    }
    const model = storage.readFile(fileName(modelFileDataId));
    const printable = [...new Set((model.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_./\\-]{7,}/g) ?? [])
      .filter((value) => value.length < 100))];
    const modelNameHints = printable.filter((value) =>
      /sign|post|pointer|door|boat|dock|bank|shop|portal|chest|barrel|crate|weapon|guild|mail|flag|stable|inn|auction|forge|alch|trainer|building|supply|tower|tavern|tent|rock/i.test(value)).slice(0, 25);
    models.push({ displayId, modelFileDataId,
      modelSha256: createHash("sha256").update(model).digest("hex"),
      modelMagic: model.subarray(0, 4).toString("latin1"),
      modelNameHints, printableHints: printable.slice(0, 8),
      placedCount: placements.length,
      mapIds: [...new Set(placements.map(({ mapId }) => mapId))],
      distinctNames: [...new Set(placements.map(({ name }) => name))].sort(),
      sampleObjectIds: placements.slice(0, 8).map(({ objectId }) => objectId) });
  }
  const signpostPointerCount = models.filter(({ modelNameHints }) =>
    modelNameHints.some((value) => /sign.*pointer|signpost/i.test(value)))
    .reduce((sum, { placedCount }) => sum + placedCount, 0);
  const taurenVenueSignCount = models.filter(({ modelNameHints }) =>
    modelNameHints.some((value) => /TaurenSign_/i.test(value)))
    .reduce((sum, { placedCount }) => sum + placedCount, 0);
  const chestNamedModelCount = models.filter(({ modelNameHints }) =>
    modelNameHints.some((value) => /chest|coffer|strongbox|lockbox/i.test(value)))
    .reduce((sum, { placedCount }) => sum + placedCount, 0);
  await writeFile(join(root, "data/client-research/world-object-model-family.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: survey.source.tables.find(({ name }) => name === "GameObjects"),
      displayInfo: { fileDataId: table.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } },
    placedWorldObjects: objects.length, distinctDisplayModels: models.length,
    signpostPointerCount, taurenVenueSignCount,
    otherModelCount: objects.length - signpostPointerCount - taurenVenueSignCount,
    chestNamedModelCount,
    caveat: "A placed model can identify artwork or wayfinding. It does not prove an interactive service, loot spawn, NPC, or active route.",
    models }, null, 2)}\n`);
  console.log(`Profiled ${objects.length} world objects across ${models.length} display models.`);
} finally {
  storage.close();
}
