/** Identify locally available chunked terrain files before parsing placements. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventory = JSON.parse(await readFile(join(root, "data/client-research/archive-flags.json"), "utf8"));
const groups = inventory.groups.filter(({ samples }) => samples.some(({ magicText }) => magicText === "REVM"));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== inventory.source.build) {
    throw new Error("The game build differs from the archive inventory.");
  }
  const records = [];
  for (const group of groups) {
    for (const sample of group.samples.filter(({ magicText }) => magicText === "REVM")) {
      const bytes = storage.readFile(sample.name);
      const chunks = [];
      for (let offset = 0; offset + 8 <= bytes.length && chunks.length < 12;) {
        const name = bytes.toString("latin1", offset, offset + 4).split("").reverse().join("");
        const size = bytes.readUInt32LE(offset + 4);
        if (offset + 8 + size > bytes.length) break;
        chunks.push({ name, size });
        offset += 8 + size;
      }
      records.push({ contentFlags: group.contentFlags, localFiles: group.local,
        fileDataId: sample.fileDataId, size: bytes.length, chunks });
    }
  }
  const output = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber }, records };
  await writeFile(join(root, "data/client-research/terrain-object-archive-profile.json"),
    `${JSON.stringify(output, null, 2)}\n`);
  console.log(records.map(({ contentFlags, fileDataId, chunks }) =>
    `${contentFlags.toString(16)} ${fileDataId}: ${chunks.map(({ name }) => name).join(", ")}`).join("\n"));
} finally { storage.close(); }
