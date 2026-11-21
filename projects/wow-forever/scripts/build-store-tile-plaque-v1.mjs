import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const brand = path.join(root, 'brand');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'));
const nameParts = manifest.meta.name.trim().split(/\s+/);
const subtitle = nameParts.pop().toUpperCase();
const title = nameParts.join(' ').toUpperCase();
const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const width = 1032;
const height = 792;
const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff0c2"/>
      <stop offset="0.48" stop-color="#d9ae59"/>
      <stop offset="1" stop-color="#9e6d2d"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#000"/>

  <g fill="none" stroke="#273340" stroke-width="3" opacity=".64">
    <path d="M-42 199 C64 101 173 114 246 35"/>
    <path d="M-27 273 C88 154 164 187 239 102"/>
    <path d="M-25 364 C73 280 142 279 222 209"/>
    <path d="M-32 452 C79 379 133 405 236 332"/>
    <path d="M1074 199 C968 101 859 114 786 35"/>
    <path d="M1059 273 C944 154 868 187 793 102"/>
    <path d="M1057 364 C959 280 890 279 810 209"/>
    <path d="M1064 452 C953 379 899 405 796 332"/>
  </g>
  <g fill="none" stroke="#624922" stroke-width="2" opacity=".56">
    <path d="M-25 141 C57 66 135 84 205 22"/>
    <path d="M1057 141 C975 66 897 84 827 22"/>
    <path d="M37 516 C116 476 167 490 225 454"/>
    <path d="M995 516 C916 476 865 490 807 454"/>
  </g>

  <rect x="11" y="11" width="1010" height="770" rx="8" fill="none" stroke="#926b2e" stroke-width="5"/>
  <rect x="27" y="27" width="978" height="738" rx="4" fill="none" stroke="#55401f" stroke-width="2"/>
  <g fill="none" stroke="#c09648" stroke-width="5" stroke-linecap="square">
    <path d="M40 133 V41 H132 M900 41 H992 V133"/>
    <path d="M40 659 V751 H132 M900 751 H992 V659"/>
  </g>
  <g fill="#bb914c">
    <path d="M40 40 l15 -15 l15 15 l-15 15z"/>
    <path d="M992 40 l-15 -15 l-15 15 l15 15z"/>
    <path d="M40 752 l15 -15 l15 15 l-15 15z"/>
    <path d="M992 752 l-15 -15 l-15 15 l15 15z"/>
  </g>

  <path d="M179 521 H430 M602 521 H853" fill="none" stroke="#a17a39" stroke-width="3"/>
  <path d="M516 509 l12 12 l-12 12 l-12 -12z" fill="#b68c45"/>
  <text x="516" y="651" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-weight="bold" letter-spacing="4" textLength="862" lengthAdjust="spacingAndGlyphs" fill="url(#gold)" stroke="#443017" stroke-width="2" paint-order="stroke">${escapeXml(title)}</text>
  <path d="M284 714 H408 M624 714 H748" fill="none" stroke="#967037" stroke-width="3"/>
  <text x="516" y="733" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="48" letter-spacing="13" fill="#dfc083">${escapeXml(subtitle)}</text>
</svg>`);

const icon = await sharp(path.join(brand, 'icon-master.png'))
  .resize(492, 492, { fit: 'fill', kernel: 'lanczos3' })
  .png()
  .toBuffer();

const master = path.join(brand, 'store-tile-master.png');
await sharp(background)
  .composite([{ input: icon, left: 270, top: 24 }])
  .png({ compressionLevel: 9 })
  .toFile(master);

const tile = sharp(master).resize(258, 198, { kernel: 'lanczos3' }).withMetadata({ density: 72 });
await tile.clone().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(path.join(brand, 'store-tile-258x198.jpg'));
await tile.clone().webp({ quality: 94, effort: 6 }).toFile(path.join(brand, 'store-tile-258x198.webp'));

console.log('Built Overwolf store tile: 258 × 198 px at 72 PPI (JPG and WebP).');
