import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const brand = path.resolve(import.meta.dirname, '..', 'brand');
const source = path.join(brand, 'hero-source-v1.png');
const width = 1920;
const height = 560;
const metadata = await sharp(source).metadata();
assert(metadata.width && metadata.height, 'Hero source dimensions are missing');
const cropHeight = Math.round(metadata.width * height / width);
assert(cropHeight <= metadata.height, 'Hero source is too short for the panoramic crop');

// Keep the brand lockup in the upper 30% safe area used by sibling store heroes.
const hero = await sharp(source)
  .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
  .resize(width, height, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toBuffer();
await fs.writeFile(path.join(brand, 'hero-1920x560.png'), hero);
await sharp(hero).webp({ quality: 94, effort: 6 }).toFile(path.join(brand, 'hero-1920x560.webp'));
await sharp(hero)
  .extract({ left: 0, top: 0, width, height: 168 })
  .png()
  .toFile(path.join(brand, 'hero-top-30-preview.png'));

for (const extension of ['png', 'webp']) {
  const file = path.join(brand, `hero-1920x560.${extension}`);
  const result = await sharp(file).metadata();
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  console.log(`${path.basename(file)}: ${width}x${height}, ${((await fs.stat(file)).size / 1024).toFixed(1)} KB`);
}
