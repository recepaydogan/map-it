/** Distinguish positioned service signs from service NPCs and buildings. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const objects = await readJson("data/client-research/service-object-candidates.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
const displayTable = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
if (!displayTable) throw new Error("Missing GameObjectDisplayInfo registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (atlas.source?.build !== build || objects.source.build !== build
    || settlements.source.build !== build) {
    throw new Error("The service objects, settlements, and atlas belong to different builds.");
  }
  const bytes = storage.readFile(fileName(displayTable.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== displayTable.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed since the client inventory.");
  }
  const byDisplay = new Map();
  for (const object of objects.records) {
    if (byDisplay.has(object.displayId)) continue;
    const display = reader.getRowData(object.displayId);
    if (!Array.isArray(display)) throw new Error(`Missing display ${object.displayId}.`);
    const modelFileDataId = display[1]?.data;
    if (!Number.isInteger(modelFileDataId) || modelFileDataId <= 0) {
      throw new Error(`Display ${object.displayId} has no model file.`);
    }
    const model = storage.readFile(fileName(modelFileDataId));
    byDisplay.set(object.displayId, {
      modelFileDataId,
      modelSignature: model.subarray(0, 4).toString("ascii"),
      modelNameHints: [...new Set((model.toString("latin1")
        .match(/[A-Za-z][A-Za-z0-9_/-]{8,}/g) ?? [])
        .filter((value) => /sign|bank|auction|inn|shop|trainer|goods|supply|port|boat|dock/i.test(value)))].slice(0, 20),
    });
  }
  const records = objects.records.map((object) => ({
    ...object,
    ...byDisplay.get(object.displayId),
    nearbySettlements: settlements.records.filter(({ mapId }) => mapId === object.mapId)
      .map(({ poiId, name, worldPosition }) => ({ poiId, name,
        worldDistance: Math.hypot(worldPosition[0] - object.worldPosition[0],
          worldPosition[1] - object.worldPosition[1]) }))
      .sort((a, b) => a.worldDistance - b.worldDistance).slice(0, 3),
  }));
  await writeFile(join(root, "data/client-research/service-object-models.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: { fileDataId: objects.source.fileDataId, sha256: objects.source.sha256 },
      displayInfo: { fileDataId: displayTable.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } },
    caveat: "A model name can classify placed artwork; it does not establish a service NPC or its inventory.",
    records }, null, 2)}\n`);
  console.log(`Inspected ${records.length} service-like objects across ${byDisplay.size} display models.`);
} finally {
  storage.close();
}
