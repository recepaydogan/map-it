/** Extract the client's own minimap tracking artwork and its file IDs. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { WDCReader } from "@rhyster/wow-casc-dbc";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const product = "wow_classic_beta";
const pathTableId = 1375801;
const pathTableLayoutHash = "618ad009";
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const outputDir = join(root, "public/maps/client-icons/tracking");
const manifestPath = join(root, "data/client-research/tracking-icons.json");
const slug = (name) => name.replace(/([a-z])([A-Z])/g, "$1-$2")
  .replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().replace(/^-|-$/g, "");

const storage = Storage.openEx(installDir, { codeName: product, region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  const tableBytes = storage.readFile(fileName(pathTableId));
  const table = new WDCReader(tableBytes);
  if (table.layoutHash.toString(16).padStart(8, "0") !== pathTableLayoutHash) {
    throw new Error("The client file path table changed layout; inspect it before extracting artwork.");
  }
  const records = [];
  const usedNames = new Set();
  await mkdir(outputDir, { recursive: true });
  for (const id of table.getAllIDs()) {
    const row = table.getRowData(id);
    if (!Array.isArray(row)) continue;
    const clientPath = `${row[0]?.string ?? ""}${row[1]?.string ?? ""}`;
    const match = /^Interface\\Minimap\\Tracking\\([^\\]+)\.blp$/i.exec(clientPath);
    if (!match) continue;
    const name = slug(match[1]);
    if (usedNames.has(name)) throw new Error(`Duplicate client tracking icon ${name}.`);
    usedNames.add(name);
    const bytes = storage.readFile(fileName(id));
    const blp = new BLPFile(bytes);
    const path = `maps/client-icons/tracking/${name}.png`;
    await sharp(blp.getPixels(0).readBuffer(), {
      raw: { width: blp.width, height: blp.height, channels: 4 },
    }).png().toFile(join(root, "public", path));
    records.push({ name, fileDataId: id, clientPath, path,
      width: blp.width, height: blp.height,
      sourceSha256: createHash("sha256").update(bytes).digest("hex") });
  }
  records.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(join(root, "data/client-research"), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({ source: { product, build, installDir,
    pathTableFileDataId: pathTableId, pathTableLayoutHash,
    pathTableSha256: createHash("sha256").update(tableBytes).digest("hex") },
  records }, null, 2)}\n`);
  console.log(`Extracted ${records.length} client tracking icons to ${outputDir}`);
} finally {
  storage.close();
}
