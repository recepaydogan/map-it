import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const master = path.join(brand, 'tile-master.png');

const render = () => sharp(master).resize(258, 198, {
  fit: 'cover',
  position: 'centre',
  kernel: 'lanczos3',
});

await render()
  .withMetadata({ density: 72 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(brand, 'store-tile-258x198.jpg'));

await render()
  .webp({ quality: 95 })
  .toFile(path.join(brand, 'store-tile-258x198.webp'));

console.log('Store tile: 258x198 JPG and WebP');
