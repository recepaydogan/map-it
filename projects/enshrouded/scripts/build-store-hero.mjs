import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const source = path.join(brand, 'hero-source-v3.png');
const width = 1920;
const height = 560;
const previewHeight = Math.round(height * 0.3);
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', 'manifest.json'), 'utf8'));
const words = manifest.meta.name.trim().split(/\s+/);
const title = words[0]?.toUpperCase();
const subtitle = words.slice(1).join(' ').toUpperCase();
const escapeXml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
})[character]);

if (!title || !subtitle) {
  throw new Error('The store hero needs both words of the app title.');
}

const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) {
  throw new Error('The hero source has no image dimensions.');
}
const cropHeight = Math.round(metadata.width * height / width);
if (cropHeight > metadata.height) {
  throw new Error('The hero source is too short for the panoramic crop.');
}
const cropTop = Math.round((metadata.height - cropHeight) * 0.42);
const background = await sharp(source)
  .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
  .resize(width, height, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g text-anchor="middle" font-family="Georgia, serif" font-weight="700">
    <text x="960" y="100" font-size="92" letter-spacing="5" fill="#172026"
      stroke="#172026" stroke-width="5" opacity=".68">${escapeXml(title)}</text>
    <text x="960" y="98" font-size="92" letter-spacing="5" fill="#f3e9d8"
      stroke="#514f4c" stroke-width="1" paint-order="stroke">${escapeXml(title)}</text>
    <text x="960" y="153" font-size="42" letter-spacing="10" fill="#172026"
      stroke="#172026" stroke-width="5" opacity=".68">${escapeXml(subtitle)}</text>
    <text x="960" y="151" font-size="42" letter-spacing="10" fill="#f3e9d8"
      stroke="#514f4c" stroke-width=".8" paint-order="stroke">${escapeXml(subtitle)}</text>
  </g>
</svg>`);

const hero = await sharp(background).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();

await sharp(hero).png().toFile(path.join(brand, 'hero-1920x560.png'));
await sharp(hero).webp({ quality: 94, effort: 6 }).toFile(path.join(brand, 'hero-1920x560.webp'));
await sharp(hero).extract({ left: 0, top: 0, width, height: previewHeight })
  .png().toFile(path.join(brand, 'hero-top-30-preview.png'));

console.log(`Store hero: ${width}x${height} PNG and WebP; upper ${previewHeight}px preview.`);
