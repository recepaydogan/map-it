/** Extract the distinct native icons referenced by locally verified item names. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidates = JSON.parse(await readFile(join(root,
  "data/client-research/item-sparse-catalog.json"), "utf8"));
const outputDirectory = join(root, "public/data/items/icons");
await mkdir(outputDirectory, { recursive: true });
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (candidates.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The item catalog and installed client belong to different builds.");
  }
  const ids = [...new Set(candidates.records.map(({ iconFileDataId }) => iconFileDataId))]
    .filter((id) => id > 0).sort((a, b) => a - b);
  const icons = [];
  const unavailable = [];
  for (const [index, fileDataId] of ids.entries()) {
    let bytes;
    try {
      bytes = storage.readFile(`FILE${fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    } catch (error) {
      if (error?.codeName !== "ERROR_FILE_NOT_FOUND") throw error;
      unavailable.push({ fileDataId, reason: error.codeName });
      continue;
    }
    const blp = new BLPFile(bytes);
    if (blp.width !== blp.height || ![32, 64, 128, 256].includes(blp.width)) {
      throw new Error(`Unsupported item icon ${fileDataId}: ${blp.width} × ${blp.height}.`);
    }
    const relativePath = `data/items/icons/${fileDataId}.png`;
    await sharp(blp.getPixels(0).readBuffer(), {
      raw: { width: blp.width, height: blp.height, channels: 4 },
    }).png().toFile(join(outputDirectory, `${fileDataId}.png`));
    icons.push({ fileDataId, path: relativePath, width: blp.width,
      sha256: createHash("sha256").update(bytes).digest("hex") });
    if ((index + 1) % 100 === 0) console.log(`Extracted ${index + 1}/${ids.length} native item icons.`);
  }
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    itemTables: candidates.source.tables.filter(({ name }) => name === "Item") },
  referencedIconCount: ids.length, extractedIconCount: icons.length,
  noIconItemCount: candidates.records.filter(({ iconFileDataId }) => iconFileDataId === 0).length,
  icons, unavailable,
  rule: "Each image is decoded from the exact FileDataID in a readable Item record. FileDataID zero or an unavailable local file yields no image." };
  await writeFile(join(root, "data/client-research/item-catalog-icon-extraction.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${icons.length}/${ids.length} native item icons extracted; ${unavailable.length} unavailable.`);
} finally {
  storage.close();
}
