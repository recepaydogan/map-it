import path from 'node:path';
import sharp from 'sharp';

const brand = path.resolve(import.meta.dirname, '..', 'brand');
const master = path.join(brand, 'store-tile-master.png');

await sharp(path.join(brand, 'store-tile-artwork.png'))
  .resize(1032, 792, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(master);

const tile = sharp(master).resize(258, 198, { kernel: 'lanczos3' }).withMetadata({ density: 72 });
await tile.clone().jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(brand, 'store-tile-258x198.jpg'));
await tile.clone().webp({ quality: 94, effort: 6 })
  .toFile(path.join(brand, 'store-tile-258x198.webp'));

console.log('Built Overwolf store tile: 258 × 198 px at 72 PPI (JPG and WebP).');
