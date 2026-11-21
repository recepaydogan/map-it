import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'public/maps/category-icons/gta6-generated');
const files = (await fs.readdir(directory)).filter(file => file.endsWith('.png')).sort();
const columns = 8, cellWidth = 144, cellHeight = 110;
const width = columns * cellWidth, height = Math.ceil(files.length / columns) * cellHeight;
const composite = [];
for (const [index, file] of files.entries()) {
  const left = index % columns * cellWidth, top = Math.floor(index / columns) * cellHeight;
  composite.push({ input: await sharp(path.join(directory, file)).resize(48, 48).toBuffer(), left: left + 15, top: top + 14 });
  composite.push({ input: await sharp(path.join(directory, file)).resize(28, 28).toBuffer(), left: left + 96, top: top + 30 });
  const label = file.replace('.png', '');
  composite.push({ input: Buffer.from(`<svg width="144" height="24"><text x="72" y="16" text-anchor="middle" font-size="11" font-family="Arial" fill="#242a30">${label}</text></svg>`), left, top: top + 76 });
}
const output = path.join(root, 'artifacts/gta6-generated-icons/contact-sheet.png');
await sharp({ create: { width, height, channels: 4, background: '#dce0d2' } }).composite(composite).png().toFile(output);
console.log(output);
