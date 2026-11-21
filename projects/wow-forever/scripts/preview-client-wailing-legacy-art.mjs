/** Compose exact-name legacy Wailing Caverns world-map textures for review. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const trace = JSON.parse(await readFile(join(root,
  "data/client-research/wailing-map-art-trace.json"), "utf8"));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (trace.source.build !== storage.getProductInfo().buildNumber
    || trace.expectedTiles.length !== 12) {
    throw new Error("The legacy art does not match this client build.");
  }
  const tiles = trace.expectedTiles.map(({ path, fileDataId }) => {
    const number = Number(/WailingCaverns1_(\d+)\.blp$/i.exec(path)?.[1]);
    if (!Number.isInteger(number) || number < 1 || number > 12) {
      throw new Error(`Unexpected Wailing Caverns texture path: ${path}`);
    }
    const bytes = storage.readFile(`FILE${fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
    const blp = new BLPFile(bytes);
    if (blp.width !== 256 || blp.height !== 256) {
      throw new Error(`Unexpected Wailing Caverns tile size: ${number}`);
    }
    return { number, fileDataId, sha256: createHash("sha256").update(bytes).digest("hex"),
      pixels: blp.getPixels(0).readBuffer() };
  }).sort((a, b) => a.number - b.number);
  if (tiles.some(({ number }, index) => number !== index + 1)) {
    throw new Error("Wailing Caverns legacy tiles are incomplete.");
  }
  const composite = await sharp({ create: { width: 1024, height: 768,
    channels: 4, background: "#00000000" } }).composite(tiles.map(({ number, pixels }) => ({
    input: pixels, raw: { width: 256, height: 256, channels: 4 },
    left: ((number - 1) % 4) * 256, top: Math.floor((number - 1) / 4) * 256,
  }))).png().toBuffer();
  await writeFile(join(root, "data/client-research/wailing-legacy-art-preview.png"), composite);
  await writeFile(join(root, "data/client-research/wailing-legacy-art-preview.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber },
    tiles: tiles.map(({ pixels, ...tile }) => tile),
    previewSha256: createHash("sha256").update(composite).digest("hex"),
    rule: "The numbered legacy textures are composed for visual research only. No active UiMap relationship was found, so this preview is not published as a current dungeon map." }, null, 2)}\n`);
  console.log("Composed 12 exact-name legacy Wailing Caverns textures for review.");
} finally {
  storage.close();
}
