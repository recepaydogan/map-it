/** Preserve the named Kuruk shop object without claiming an NPC or inventory. */
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
const places = await readJson("data/client-research/published-marker-evidence.json");
const thunderBluff = places.markers.find(({ name }) => name === "Thunder Bluff");
if (!thunderBluff) throw new Error("Missing Thunder Bluff client overlay evidence.");
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`Missing client ${name}.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed since the inventory.`);
  }
  return { reader, source: { name, fileDataId: record.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber
    || places.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The shop clue and atlas belong to different builds.");
  }
  const objects = readTable("GameObjects");
  const displays = readTable("GameObjectDisplayInfo");
  const project = createClientWorldProjector(atlas);
  const records = [];
  for (const id of objects.reader.getAllIDs()) {
    const row = objects.reader.getRowData(id);
    if (row?.[0]?.string !== "Kuruk's Goods") continue;
    const positionBytes = Buffer.alloc(12);
    for (let index = 0; index < 3; index += 1) {
      positionBytes.writeUInt32LE(Number((row[1].data >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
    }
    const worldPosition = [0, 4, 8].map((offset) => positionBytes.readFloatLE(offset));
    const mapId = row[4].data;
    const atlasPosition = project(mapId, worldPosition);
    const displayId = row[5].data;
    const display = displays.reader.getRowData(displayId);
    const modelFileDataId = display?.[1]?.data ?? null;
    const modelBytes = modelFileDataId ? storage.readFile(fileName(modelFileDataId)) : null;
    const modelNameHint = modelBytes?.toString("latin1")
      .match(/[A-Za-z0-9_/-]*Sign[A-Za-z0-9_/-]*/)?.[0] ?? null;
    const insideThunderBluffOverlay = mapId === thunderBluff.sourceIds.worldMapId
      && atlasPosition
      && atlasPosition.x >= thunderBluff.atlasBounds.minX
      && atlasPosition.x <= thunderBluff.atlasBounds.maxX
      && atlasPosition.y >= thunderBluff.atlasBounds.minY
      && atlasPosition.y <= thunderBluff.atlasBounds.maxY;
    records.push({ objectId: id, name: row[0].string, mapId,
      worldPosition, atlasPosition,
      displayId, modelFileDataId,
      modelSignature: modelBytes?.subarray(0, 4).toString("ascii") ?? null,
      modelNameHint,
      insideThunderBluffOverlay: !!insideThunderBluffOverlay });
  }
  await writeFile(join(root, "data/client-research/kuruk-shop-clue.json"),
    `${JSON.stringify({ source: {
      product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      tables: [objects.source, displays.source],
      placeEvidence: "published-marker-evidence.json",
    }, rule: "Exact named GameObjects records; a world Map ID 1 occurrence projects inside the verified Thunder Bluff overlay.",
    caveat: "The model embeds a Tauren general-sign name. This is wayfinding artwork; it does not establish the NPC Kuruk's spawn or merchant inventory.",
    records }, null, 2)}\n`);
  console.log(`Preserved ${records.length} Kuruk's Goods object records; ${records.filter(({ insideThunderBluffOverlay }) => insideThunderBluffOverlay).length} inside Thunder Bluff.`);
} finally {
  storage.close();
}
