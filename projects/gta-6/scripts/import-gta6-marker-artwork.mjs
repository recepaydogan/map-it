import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, 'artifacts/gta6-icon-research');
const catalog = JSON.parse(await fs.readFile(path.join(cache, 'blips.json'), 'utf8'));
const mapping = JSON.parse(await fs.readFile(path.join(root, 'scripts/data/gta6-native-marker-symbols.json'), 'utf8'));
const semanticSources = JSON.parse(await fs.readFile(path.join(root, 'scripts/data/gta6-semantic-symbols.json'), 'utf8'));
const previous = JSON.parse(await fs.readFile(path.join(root, 'public/data/gta6/marker-artwork.json'), 'utf8'));
const manifest = { version: 2, symbols: {}, assets: [] };
const hash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const publicRoot = path.join(root, 'public');
async function save(relative, bytes, upstream) {
  const image = await sharp(bytes).metadata();
  if (image.format !== 'png' || !image.hasAlpha) throw new Error(`Expected transparent PNG: ${relative}`);
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(publicRoot + path.sep)) throw new Error('Invalid artwork path');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  manifest.assets.push({ path: relative, upstream, size: bytes.length, sha: hash(bytes) });
}
const supplemental = ['account-balance', 'hotel', 'restaurant', 'forest', 'agriculture', 'construction', 'traffic-jam', 'church', 'school', 'phishing', 'storefront', 'eight-ball', 'flight', 'smartphone', 'local-parking', 'nightlife', 'sports-basketball'];
for (const symbol of [...supplemental, ...Object.keys(semanticSources)]) delete mapping[symbol];
for (const name of new Set(Object.values(mapping))) {
  const entry = catalog.find(icon => icon.name === name);
  if (!entry) throw new Error(`Unknown game symbol: ${name}`);
  const relative = `maps/category-icons/gta6-blips/${name.replace('radar_', '').replaceAll('_', '-')}.png`;
  let bytes = await fs.readFile(path.join(publicRoot, relative)).catch(() => null);
  if (!bytes) {
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${entry.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  await save(relative, bytes, entry.url);
  for (const [symbol, native] of Object.entries(mapping)) if (native === name) manifest.symbols[symbol] = relative;
}
// Preserve the exact fuel-pump artwork selected by the user.
const fuelPath = 'maps/category-icons/gta6-png/fuel-pump.png';
const fuelAsset = previous.assets.find(asset => asset.path === fuelPath);
await save(fuelPath, await fs.readFile(path.join(publicRoot, fuelPath)), fuelAsset?.upstream ?? 'preserved-fuel-pump');
manifest.symbols['local-gas-station'] = fuelPath;
// Compile existing filled vector artwork where the game has no equivalent marker.
// A narrow outline follows the actual silhouette; no circular button background.
for (const symbol of [...supplemental, 'water-tower', 'lighthouse', 'suspension-bridge', ...Object.keys(semanticSources)]) {
  const relative = `maps/category-icons/gta6-blips/symbols/${symbol}.png`;
  const source = semanticSources[symbol] ?? `maps/category-icons/gta6/${symbol}.svg`;
  const svgFile = semanticSources[symbol]
    ? source.startsWith('https://') ? path.join(cache, `${symbol}.svg`) : path.join(root, source)
    : path.join(publicRoot, source);
  let svg = await fs.readFile(svgFile, 'utf8').catch(() => null);
  if (!svg) {
    const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${source}`);
    svg = await response.text();
    if (!svg.includes('<svg') || !svg.includes('<path')) throw new Error(`Invalid symbol: ${symbol}`);
    await fs.writeFile(svgFile, svg);
  }
  svg = svg.replace(/<svg\b([^>]*)>/, (_, attributes) => `<svg${attributes.replace(/\sfill="[^"]*"/g, '')} fill="#faf7f0">`)
    .replace(/#(?:ffffff|fff)\b/gi, '#faf7f0');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const stroke = Math.max(viewBox[2], viewBox[3]) / 28;
  svg = svg.replace('<svg ', `<svg stroke="#14202b" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke fill" `);
  const bytes = await sharp(Buffer.from(svg)).resize(96, 96, { fit: 'contain' }).png().toBuffer();
  await save(relative, bytes, source);
  manifest.symbols[symbol] = relative;
}
// Generated project artwork overrides legacy symbols without changing place classification.
const generatedFile = path.join(root, 'scripts/data/gta6-generated-marker-artwork.json');
const generated = JSON.parse(await fs.readFile(generatedFile, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '{"symbols":{}}';
  throw error;
}));
for (const relative of new Set(Object.values(generated.symbols))) {
  await save(relative, await fs.readFile(path.join(publicRoot, relative)), 'original-generated-artwork');
}
Object.assign(manifest.symbols, generated.symbols);
manifest.assets = manifest.assets.filter(asset => Object.values(manifest.symbols).includes(asset.path));
manifest.assets.sort((a,b) => a.path.localeCompare(b.path));
await fs.writeFile(path.join(publicRoot, 'data/gta6/marker-artwork.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root, 'src/features/map/gta6-marker-artwork.json'), JSON.stringify(manifest.symbols, null, 2) + '\n');
const noticeFile = path.join(publicRoot, 'licenses/gta6-marker-artwork.txt');
const originalNotice = await fs.readFile(noticeFile, 'utf8');
if (!originalNotice.includes('GTA map blips')) await fs.writeFile(noticeFile, originalNotice + '\nGTA map blips: Rockstar Games; reference images from https://docs.fivem.net/docs/game-references/blips/. Native PNGs are unmodified. Filled supplemental symbols retain the licenses in gta6-media.txt.\n');
console.log(JSON.stringify({ symbols: Object.keys(manifest.symbols).length, pngs: manifest.assets.length,
  generatedSymbols: Object.keys(generated.symbols).length }));
