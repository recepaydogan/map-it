/** Contact sheets for identifying local client maps before publishing them. */
import { readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const index = JSON.parse(await readFile(join(projectRoot, "data/client-map-extraction/wdt-index.json"), "utf8"));
const outputDir = join(projectRoot, "data/client-map-extraction/previews/wdt-candidates");
await mkdir(outputDir, { recursive: true });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = new Storage();
storage.openEx(index.source.installDir, { codeName: index.source.product, region: "us", localeMask: CASC_LOCALE_ENUS, online: false });

const tilePixels = 16;
const cellWidth = 250;
const cellHeight = 215;
const columns = 4;
const pageSize = 20;
const cards = [];
try {
  for (const map of index.maps.filter(({ tileCount }) => tileCount >= 9 && tileCount < 500)) {
    const wdt = storage.readFile(fileName(map.wdtFileDataId));
    let maid;
    for (let offset = 0; offset + 8 <= wdt.length;) {
      const kind = wdt.subarray(offset, offset + 4).toString("ascii");
      const size = wdt.readUInt32LE(offset + 4);
      if (kind === "DIAM") maid = wdt.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size;
    }
    if (!maid) continue;
    const { minX, minY, maxX, maxY } = map.grid;
    const width = (maxX - minX + 1) * tilePixels;
    const height = (maxY - minY + 1) * tilePixels;
    const canvas = Buffer.alloc(width * height * 4);
    for (let offset = 0; offset < canvas.length; offset += 4) {
      canvas[offset] = 9; canvas[offset + 1] = 38; canvas[offset + 2] = 52; canvas[offset + 3] = 255;
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const id = maid.readUInt32LE((y * 64 + x) * 32 + 28);
        if (!id) continue;
        const blp = new BLPFile(storage.readFile(fileName(id)));
        const pixels = blp.getPixels(0).readBuffer();
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
          if ((red <= 18 && green <= 45 && blue <= 24)
            || (red <= 42 && green >= 43 && green <= 65 && blue >= 55 && blue <= 90
              && blue >= green + 8 && green >= red + 8)) {
            pixels[offset] = 9; pixels[offset + 1] = 38; pixels[offset + 2] = 52;
          }
        }
        const thumb = await sharp(pixels, { raw: { width: blp.width, height: blp.height, channels: 4 } })
          .resize(tilePixels, tilePixels).raw().toBuffer();
        const tileX = (x - minX) * tilePixels;
        const tileY = (y - minY) * tilePixels;
        for (let row = 0; row < tilePixels; row += 1) {
          thumb.copy(canvas, ((tileY + row) * width + tileX) * 4,
            row * tilePixels * 4, (row + 1) * tilePixels * 4);
        }
      }
    }
    const image = await sharp(canvas, { raw: { width, height, channels: 4 } })
      .resize(220, 175, { fit: "contain", background: "#092634" }).png().toBuffer();
    cards.push({ id: map.wdtFileDataId, count: map.tileCount, image });
    console.log(`Previewed WDT ${map.wdtFileDataId} (${map.tileCount} tiles).`);
  }
} finally {
  storage.close();
}

for (let page = 0; page < Math.ceil(cards.length / pageSize); page += 1) {
  const slice = cards.slice(page * pageSize, (page + 1) * pageSize);
  const rows = Math.ceil(slice.length / columns);
  const overlays = [];
  for (const [index, card] of slice.entries()) {
    const left = index % columns * cellWidth;
    const top = Math.floor(index / columns) * cellHeight;
    overlays.push({ input: card.image, left: left + 15, top: top + 30 });
    const label = `<svg width="250" height="28"><text x="15" y="19" fill="white" font-family="Arial" font-size="16">${card.id} · ${card.count} tiles</text></svg>`;
    overlays.push({ input: Buffer.from(label), left, top });
  }
  const output = join(outputDir, `page-${page + 1}.png`);
  await sharp({ create: { width: cellWidth * columns, height: cellHeight * rows,
    channels: 4, background: "#092634" } }).composite(overlays).png().toFile(output);
  console.log(output);
}
