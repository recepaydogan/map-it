/** Search doodad assets embedded inside every placed world model, including Zephras. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = JSON.parse(await readFile(join(root,
  "data/client-research/adt-placement-profile.json"), "utf8"));
const zephras = JSON.parse(await readFile(join(root,
  "data/client-research/zephras-repair-model-trace.json"), "utf8"));
const modelIds = [...new Set([...profile.worldModels.map(({ fileDataId }) => fileDataId),
  ...zephras.worldModelIds])].sort((a, b) => a - b);
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const chunksOf = (bytes) => {
  const chunks = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Malformed chunk at ${offset}.`);
    chunks.push({ name: bytes.toString("latin1", offset, offset + 4)
      .split("").reverse().join(""), offset: offset + 8, size });
    offset += 8 + size;
  }
  return chunks;
};
const terms = /repair|smith|armou?r|weapon|forge|anvil|vendor|merchant|dealer|shop|wrench|hammer/i;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== profile.source.build || build !== zephras.source.build) {
    throw new Error("Installed game build changed.");
  }
  const references = new Map();
  let rootsWithDoodads = 0;
  for (const modelFileDataId of modelIds) {
    const bytes = storage.readFile(fileName(modelFileDataId));
    const modi = chunksOf(bytes).find(({ name }) => name === "MODI");
    if (!modi) continue;
    if (modi.size % 4) throw new Error(`Invalid MODI in ${modelFileDataId}.`);
    rootsWithDoodads += 1;
    for (let offset = modi.offset; offset < modi.offset + modi.size; offset += 4) {
      const doodadFileDataId = bytes.readUInt32LE(offset);
      if (!doodadFileDataId) continue;
      const roots = references.get(doodadFileDataId) ?? new Set();
      roots.add(modelFileDataId);
      references.set(doodadFileDataId, roots);
    }
  }
  const matches = [];
  const unavailable = [];
  for (const [doodadFileDataId, roots] of references) {
    const name = fileName(doodadFileDataId);
    const info = storage.getFileInfo(name);
    if (!info || info.size === 0xffff_ffff) {
      unavailable.push(doodadFileDataId);
      continue;
    }
    let bytes;
    try { bytes = storage.readFile(name); }
    catch (error) {
      if (error?.codeName !== "ERROR_FILE_ENCRYPTED") throw error;
      unavailable.push(doodadFileDataId);
      continue;
    }
    const names = [...new Set(bytes.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])]
      .filter((value) => terms.test(value)).slice(0, 25);
    if (!names.length) continue;
    matches.push({ doodadFileDataId,
      magic: bytes.subarray(0, 4).toString("latin1"), names,
      worldModelFileDataIds: [...roots].sort((a, b) => a - b) });
  }
  matches.sort((a, b) => a.doodadFileDataId - b.doodadFileDataId);
  const exactRepair = matches.filter(({ names }) => names.some((name) => /repair/i.test(name)));
  const output = { source: { product: storage.getProductInfo().codeName, build },
    inspectedWorldModels: modelIds.length, rootsWithDoodads,
    embeddedDoodadAssets: references.size, unavailable,
    matchingAssets: matches, exactRepairAssets: exactRepair };
  await writeFile(join(root, "data/client-research/wmo-service-doodad-trace.json"),
    `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Scanned ${references.size} embedded doodad assets from ${rootsWithDoodads} placed WMO roots; ${matches.length} service/gear names, ${exactRepair.length} explicitly repair-named.`);
  console.log(exactRepair.map(({ doodadFileDataId, names, worldModelFileDataIds }) =>
    `${doodadFileDataId}: ${names.join(", ")} in ${worldModelFileDataIds.join(",")}`).join("\n"));
} finally {
  storage.close();
}
