import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.join(root, 'artifacts/gta6-generated-icons');
const results = path.join(workspace, 'results');
const originals = path.join(workspace, 'originals');
const output = path.join(root, 'public/maps/category-icons/gta6-generated');
await fs.mkdir(originals, { recursive: true });
await fs.mkdir(output, { recursive: true });
const entries = [];
for (const file of (await fs.readdir(results)).filter(file => file.endsWith('.json')).sort()) {
  const entry = JSON.parse(await fs.readFile(path.join(results, file), 'utf8'));
  if (!/^[a-z0-9-]+$/.test(entry.symbol)) throw new Error('Invalid symbol');
  const original = path.join(originals, `${entry.symbol}.png`);
  await fs.access(original).catch(() => fs.copyFile(entry.source, original));
  const metadata = await sharp(original).metadata();
  if (!metadata.hasAlpha) throw new Error(`Missing alpha: ${entry.symbol}`);
  // Normalize transparent margins, retain original proportions and a 4px safety border.
  await sharp(original).trim({ threshold: 10 }).resize(120, 120, {
    fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).extend({ top: 4, bottom: 4, left: 4, right: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toFile(path.join(output, `${entry.symbol}.png`));
  entries.push({ symbol: entry.symbol, path: `maps/category-icons/gta6-generated/${entry.symbol}.png`,
    prompt: entry.prompt, original: `artifacts/gta6-generated-icons/originals/${entry.symbol}.png` });
}
const aliases = { boat: 'anchor', 'car-rental': 'directions-car',
  'crossed-pistols': 'pistol-gun', factory: 'warehouse', 'golf-course': 'sports-golf' };
const symbols = Object.fromEntries(entries.map(entry => [entry.symbol, entry.path]));
for (const [alias, symbol] of Object.entries(aliases)) if (symbols[symbol]) symbols[alias] = symbols[symbol];
await fs.writeFile(path.join(root, 'scripts/data/gta6-generated-marker-artwork.json'),
  JSON.stringify({ version: 1, generator: 'built-in-imagegen', symbols, entries }, null, 2) + '\n');
console.log(JSON.stringify({ images: entries.length, symbols: Object.keys(symbols).length }));
