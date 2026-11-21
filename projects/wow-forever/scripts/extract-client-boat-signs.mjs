/** Trace placed destination signs at world-map docks without inferring a boat schedule. */
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
const serviceObjects = await readJson("data/client-research/service-object-candidates.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (atlas.source?.build !== build || serviceObjects.source.build !== build
    || settlements.source.build !== build) throw new Error("Boat sign sources belong to different builds.");
  const record = byName.get("GameObjectDisplayInfo");
  if (!record) throw new Error("GameObjectDisplayInfo is missing from the client index.");
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed since the client inventory.");
  }
  const signs = [];
  for (const object of serviceObjects.records.filter(({ name, mapId }) =>
    name.startsWith("Boat to ") && [0, 1].includes(mapId))) {
    const display = reader.getRowData(object.displayId);
    const modelFileDataId = display?.[1]?.data ?? null;
    const modelBytes = modelFileDataId ? storage.readFile(fileName(modelFileDataId)) : null;
    const modelStrings = modelBytes?.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_/-]{8,}/g)?.filter((value) =>
        /sign|boat|ship|dock|port|harbor/i.test(value)).slice(0, 12) ?? [];
    const nearestSettlements = settlements.records.filter(({ mapId }) => mapId === object.mapId)
      .map(({ poiId, name, worldPosition }) => ({ poiId, name,
        worldDistance: Math.hypot(worldPosition[0] - object.worldPosition[0],
          worldPosition[1] - object.worldPosition[1]) }))
      .sort((a, b) => a.worldDistance - b.worldDistance).slice(0, 3);
    signs.push({ ...object, modelFileDataId,
      modelSignature: modelBytes?.subarray(0, 4).toString("ascii") ?? null,
      modelStrings, nearestSettlements });
  }
  await writeFile(join(root, "data/client-research/boat-signs.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: { fileDataId: serviceObjects.source.fileDataId,
        sha256: serviceObjects.source.sha256 },
      displayInfo: { fileDataId: record.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } },
    caveat: "Named GameObjects identify placed destination signs. Sign position and name alone do not verify a functioning boat, timetable, or exact boarding spot.",
    signs }, null, 2)}\n`);
  console.log(`Traced ${signs.length} world-map boat destination signs.`);
} finally {
  storage.close();
}
