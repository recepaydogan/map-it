import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const source = path.join(brand, 'hero-source-v1.png');
const width = 1920;
const height = 560;
const previewHeight = Math.round(height * 0.3);
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', 'manifest.json'), 'utf8'));
const locale = JSON.parse(await fs.readFile(path.join(root, 'src', 'i18n', 'locales', 'en.json'), 'utf8'));
const words = manifest.meta.name.trim().split(/\s+/);
const title = words.join(' ').toUpperCase();
const features = locale.app.storeHeroFeatures;
const escapeXml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
})[character]);

if (!title || !features) {
  throw new Error('The store hero needs an app title and feature line.');
}

const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) {
  throw new Error('The hero source has no image dimensions.');
}
const cropHeight = Math.round(metadata.width * height / width);
if (cropHeight > metadata.height) {
  throw new Error('The hero source is too short for the panoramic crop.');
}
const background = await sharp(source)
  .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
  .resize(width, height, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

// The app icon has a black matte; remove it for a clean lockup over the sky.
const iconSize = 64;
const { data: iconPixels, info: iconInfo } = await sharp(path.join(brand, 'icon-master.png'))
  .resize(iconSize, iconSize)
  .raw()
  .toBuffer({ resolveWithObject: true });
const transparentPixels = Buffer.alloc(iconSize * iconSize * 4);
for (let sourceIndex = 0, targetIndex = 0; sourceIndex < iconPixels.length; sourceIndex += iconInfo.channels, targetIndex += 4) {
  const red = iconPixels[sourceIndex];
  const green = iconPixels[sourceIndex + 1];
  const blue = iconPixels[sourceIndex + 2];
  transparentPixels[targetIndex] = red;
  transparentPixels[targetIndex + 1] = green;
  transparentPixels[targetIndex + 2] = blue;
  transparentPixels[targetIndex + 3] = Math.max(0, Math.min(255, (Math.max(red, green, blue) - 3) * 12));
}
const icon = await sharp(transparentPixels, {
  raw: { width: iconSize, height: iconSize, channels: 4 },
}).png().toBuffer();

const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff0b8"/>
      <stop offset=".45" stop-color="#ecc87d"/>
      <stop offset="1" stop-color="#b47a35"/>
    </linearGradient>
  </defs>
  <g text-anchor="middle" font-family="Copperplate Gothic Bold, Georgia, serif" font-weight="700">
    <text x="960" y="118" font-size="62" letter-spacing=".5" fill="#061523"
      stroke="#061523" stroke-width="10" opacity=".85">${escapeXml(title)}</text>
    <text x="960" y="118" font-size="62" letter-spacing=".5" fill="url(#gold)"
      stroke="#694018" stroke-width="2" paint-order="stroke">${escapeXml(title)}</text>
    <text x="960" y="155" font-size="25" letter-spacing="1" fill="#061523"
      stroke="#061523" stroke-width="6" opacity=".85">${escapeXml(features)}</text>
    <text x="960" y="155" font-size="25" letter-spacing="1" fill="url(#gold)">${escapeXml(features)}</text>
  </g>
</svg>`);

const hero = await sharp(background).composite([
  { input: overlay, left: 0, top: 0 },
  { input: icon, left: (width - iconSize) / 2, top: 7 },
]).png().toBuffer();

await sharp(hero).png().toFile(path.join(brand, 'hero-1920x560.png'));
await sharp(hero).webp({ quality: 94, effort: 6 }).toFile(path.join(brand, 'hero-1920x560.webp'));
await sharp(hero).extract({ left: 0, top: 0, width, height: previewHeight })
  .png().toFile(path.join(brand, 'hero-top-30-preview.png'));

console.log(`Store hero: ${width}x${height} PNG and WebP; upper ${previewHeight}px preview.`);
