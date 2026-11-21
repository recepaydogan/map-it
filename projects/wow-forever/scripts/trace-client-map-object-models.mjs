/** Identify display artwork for positioned objects on locally tileable maps. */
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
const registration = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
if (!registration) throw new Error("Missing GameObjectDisplayInfo registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (survey.source.build !== build) throw new Error("Map survey and local client builds differ.");
  const displayBytes = storage.readFile(fileName(registration.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(displayBytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed.");
  }
  const ids = [...new Set(survey.maps.filter(({ mapId }) => ![0, 1].includes(mapId))
    .flatMap(({ gameObjects }) => gameObjects.map(({ displayId }) => displayId)))].sort((a, b) => a - b);
  const records = ids.map((displayId) => {
    const row = reader.getRowData(displayId);
    if (!Array.isArray(row)) throw new Error(`Missing display ${displayId}.`);
    const modelFileDataId = row[1]?.data;
    if (!Number.isSafeInteger(modelFileDataId) || modelFileDataId <= 0) {
      throw new Error(`Display ${displayId} lacks a model file.`);
    }
    const model = storage.readFile(fileName(modelFileDataId));
    const modelNameHints = [...new Set(model.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_./\\-]{5,}/g) ?? [])]
      .filter((value) => /sign|post|pointer|door|boat|dock|bank|shop|portal|chest/i.test(value))
      .slice(0, 25);
    return { displayId, modelFileDataId,
      modelSha256: createHash("sha256").update(model).digest("hex"),
      modelMagic: model.subarray(0, 4).toString("latin1"), modelNameHints };
  });
  await writeFile(join(root, "data/client-research/map-object-models.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      displayInfo: { fileDataId: registration.fileDataId,
        sha256: createHash("sha256").update(displayBytes).digest("hex"), omittedSections } },
    caveat: "Artwork identifies a placed object's visible model, not a destination, service, or active state.",
    records }, null, 2)}\n`);
  console.log(records.map(({ displayId, modelFileDataId, modelNameHints }) =>
    `${displayId} → ${modelFileDataId}: ${modelNameHints.slice(0, 4).join(", ")}`).join("\n"));
} finally { storage.close(); }
