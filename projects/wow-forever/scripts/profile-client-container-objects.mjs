/** Inventory placed chest-like client objects before treating them as loot. */
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
const registration = catalog.identified.find(({ name }) => name === "GameObjects");
if (!registration) throw new Error("Missing GameObjects table registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || atlas.source.build !== build) {
    throw new Error("Container scan and atlas belong to different client builds.");
  }
  const fileName = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error("GameObjects layout differs from the local executable.");
  }
  const project = createClientWorldProjector(atlas);
  const terms = ["chest", "coffer", "cache", "strongbox", "lockbox", "treasure", "crate", "barrel"];
  const records = [];
  for (const objectId of reader.getAllIDs()) {
    const row = reader.getRowData(objectId);
    const name = row?.[0]?.string;
    if (!name || !terms.some((term) => name.toLowerCase().includes(term))) continue;
    const packed = Buffer.alloc(12);
    for (let index = 0; index < 3; index += 1) {
      packed.writeUInt32LE(Number((row[1].data >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
    }
    const worldPosition = [0, 4, 8].map((offset) => packed.readFloatLE(offset));
    const mapId = row[4].data;
    records.push({ objectId, name, mapId, worldPosition,
      atlasPosition: project(mapId, worldPosition), displayId: row[5].data });
  }
  const source = { product: storage.getProductInfo().codeName, build,
    table: "GameObjects", fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections };
  const output = join(root, "data/client-research/placed-container-object-candidates.json");
  await writeFile(output, `${JSON.stringify({ source, terms,
    caveat: "A placed chest-like name or model does not by itself establish an interactive or lootable treasure.",
    records }, null, 2)}\n`);
  console.log(`Found ${records.length} chest-like placed client objects.`);
} finally {
  storage.close();
}
