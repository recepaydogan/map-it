import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const source = path.join(brand, 'hero-master.png');
const width = 1920;
const height = 560;
const topPreviewHeight = Math.round(height * 0.3);
const metadata = await sharp(source).metadata();

if (!metadata.width || !metadata.height) {
  throw new Error('The hero master has no image dimensions.');
}

const cropHeight = Math.round(metadata.width * height / width);
if (cropHeight > metadata.height) {
  throw new Error('The hero master is too short for a top-anchored crop.');
}

const hero = await sharp(source)
  .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
  .resize(width, height, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(hero).png({ compressionLevel: 9 }).toFile(path.join(brand, 'hero-1920x560.png'));
await sharp(hero).webp({ quality: 94, effort: 6 }).toFile(path.join(brand, 'hero-1920x560.webp'));
await sharp(hero)
  .extract({ left: 0, top: 0, width, height: topPreviewHeight })
  .png({ compressionLevel: 9 })
  .toFile(path.join(brand, 'hero-top-30-preview.png'));

console.log(`Store hero: ${width}x${height} PNG and WebP; upper ${topPreviewHeight}px preview`);
