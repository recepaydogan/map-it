import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const brand = path.resolve(import.meta.dirname, '..', 'brand');
const master = path.join(brand, 'store-tile-master.png');
await sharp(path.join(brand, 'store-tile-source.png'))
  .resize(1032, 792, { fit: 'cover', position: 'centre' })
  .png({ compressionLevel: 9 })
  .toFile(master);

for (const format of ['jpg', 'webp']) {
  const output = path.join(brand, `store-tile-258x198.${format}`);
  const tile = sharp(master).resize(258, 198, { kernel: 'lanczos3' }).withMetadata({ density: 72 });
  if (format === 'jpg') await tile.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(output);
  else await tile.webp({ quality: 94, effort: 6 }).toFile(output);
  const metadata = await sharp(output).metadata();
  const { size } = await fs.stat(output);
  assert.equal(metadata.width, 258);
  assert.equal(metadata.height, 198);
  assert(size < 100 * 1024, `${output} exceeds 100 KB`);
  console.log(`${path.basename(output)}: 258 x 198, ${(size / 1024).toFixed(1)} KB`);
}
