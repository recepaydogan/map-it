import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const directory = await mkdtemp(join(tmpdir(), "peak-map-converter-test-"));
const tiles = join(directory, "tiles");
await mkdir(tiles);
const pixels = Buffer.alloc(16 * 16 * 3);
for (let y = 4; y < 12; y++) {
  for (let x = 4; x < 12; x++) {
    pixels.set([200, 150, 100], (y * 16 + x) * 3);
  }
}
await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } }).png().toFile(join(directory, "map.png"));
for (let row = 0; row < 4; row++) {
  for (let column = 0; column < 4; column++) {
    await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } })
      .extract({ left: column * 4, top: row * 4, width: 4, height: 4 })
      .resize(16, 16, { kernel: "nearest" }).png()
      .toFile(join(directory, `map.tile-${column}-${row}.png`));
  }
}
execFileSync(process.execPath, ["tools/map-capture/convert-map-capture.mjs", join(directory, "map.png"),
  join(directory, "map.webp"), "--tiles", tiles, "4"], { stdio: "pipe" });
const result = await sharp(join(directory, "map.webp")).removeAlpha().raw().toBuffer();
assert.deepEqual([...result.subarray(0, 3)], [28, 69, 82]);
assert.deepEqual([...result.subarray((8 * 16 + 8) * 3, (8 * 16 + 8) * 3 + 3)], [200, 150, 100]);
assert.equal((await readdir(tiles)).length, 16);
for (const file of await readdir(tiles)) {
  const metadata = await sharp(join(tiles, file)).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 16);
}
console.log("Map converter passed: lossless overview colors and all 16 concurrent tiles.");
