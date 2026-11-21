import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import reviewedMatches from './data/gta6-media-matches.json' with { type: 'json' };
import reviewedCoordinates from './data/gta6-location-coordinates.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, 'artifacts/gtabase-import');
const publicRoot = path.join(root, 'public');
const read = async file => JSON.parse(await fs.readFile(path.join(cache, file), 'utf8'));
const mediaFile = path.join(publicRoot, 'data/gta6/media.json');
const [markers, icons, categories, catalog, previousMedia] = await Promise.all([
  read('markers.json'), read('icons.json'), read('categories.json'),
  fs.readFile(path.join(root, 'artifacts/gta6-import/raw-catalog.json'), 'utf8')
    .catch(() => fs.readFile(path.join(publicRoot, 'data/gta6/landmarks.json'), 'utf8')).then(JSON.parse),
  fs.readFile(mediaFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return { assets: [] };
  }),
]);
const normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const byId = new Map(catalog.records.map(record => [record.landmark.id, record]));
const categoryIcons = Object.fromEntries(categories.categories.map(category => [category.id, category.icon]));
const records = {}, assets = [], matched = [], unmatched = [];
const hash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const previousPhotos = new Map(previousMedia.assets.filter(asset => asset.path.startsWith('maps/leonida/photos/'))
  .map(asset => [asset.upstream, asset]));
async function photoBytes(url) {
  const previous = previousPhotos.get(url.href);
  if (previous) {
    const file = path.resolve(publicRoot, previous.path);
    if (!file.startsWith(path.join(publicRoot, 'maps', 'leonida', 'photos') + path.sep)) throw new Error('Invalid photo cache path');
    const bytes = await fs.readFile(file).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (bytes?.length === previous.size && hash(bytes) === previous.sha) return bytes;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function saveAsset(relative, bytes, upstream) {
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(publicRoot + path.sep)) throw new Error('Invalid asset path');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  assets.push({ path: relative, size: bytes.length, sha: hash(bytes), upstream });
}
for (const [id, icon] of Object.entries(icons)) {
  if (id === 'question_mark') continue;
  if (!/^[a-z0-9_-]+$/.test(id) || !/^[0-9 .-]+$/.test(icon.viewBox)
    || icon.paths.some(value => !/^[a-zA-Z0-9., -]+$/.test(value))) throw new Error('Invalid icon geometry');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="#faf7f0">${icon.paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;
  await saveAsset(`maps/category-icons/gta6/${id.replaceAll('_', '-')}.svg`, Buffer.from(svg), `https://www.gtabase.com/images/gta-6/maps/gtab-map/icons.js#${id}`);
}
// Filled game-map symbols for place types absent from the original icon subset.
for (const name of ['hotel', 'factory', 'forest', 'agriculture', 'construction', 'electrical_services', 'train',
  'local_parking', 'cell_tower', 'church', 'school', 'sports_tennis', 'sports_basketball']) {
  if (icons[name]) continue;
  const upstream = `https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/${name}/materialsymbolsoutlined/${name}_fill1_24px.svg`;
  const cached = path.join(cache, `${name}.svg`);
  let svg = await fs.readFile(cached, 'utf8').catch(() => null);
  if (!svg) {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${upstream}`);
    svg = await response.text();
    if (!svg.includes('<svg') || !svg.includes('<path')) throw new Error('Invalid symbol');
    await fs.writeFile(cached, svg);
  }
  svg = svg.replace('<svg ', '<svg fill="#faf7f0" ');
  await saveAsset(`maps/category-icons/gta6/${name.replaceAll('_', '-')}.svg`, Buffer.from(svg), upstream);
}
for (const name of ['suspension-bridge', 'water-tower', 'lighthouse']) {
  const upstream = `https://game-icons.net/icons/ffffff/transparent/1x1/delapouite/${name}.svg`;
  const cached = path.join(cache, `${name}.svg`);
  let svg = await fs.readFile(cached, 'utf8').catch(() => null);
  if (!svg) {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${upstream}`);
    svg = await response.text();
    if (!svg.includes('<svg') || !svg.includes('<path')) throw new Error('Invalid symbol');
    await fs.writeFile(cached, svg);
  }
  await saveAsset(`maps/category-icons/gta6/${name}.svg`, Buffer.from(svg.replace(/#(?:ffffff|fff)\b/gi, '#faf7f0')), upstream);
}
for (const marker of markers) {
  let candidates = catalog.records.filter(record => normalize(record.name) === normalize(marker.name)
    || normalize(record.landmark.inGameAddress.split(',')[0]) === normalize(marker.name));
  // Reviewed aliases refer to the same place; geography alone never assigns a photograph.
  if (reviewedMatches[marker.id]) candidates = [byId.get(reviewedMatches[marker.id])];
  candidates = candidates.filter(Boolean).map(record => {
    const source = record.landmark.gameCoordinates;
    const coordinates = source ? [source.x, source.y] : reviewedCoordinates[record.landmark.id];
    return { record, distance: coordinates ? Math.hypot(coordinates[0] - marker.x, coordinates[1] - marker.y) : Infinity };
  })
    .sort((a, b) => a.distance - b.distance);
  const match = marker.category === 'city-town'
    ? { record: { landmark: { id: marker.id } }, distance: 0 }
    : candidates[0];
  if (!match || match.distance > 500) { unmatched.push({ id: marker.id, name: marker.name, photo: Boolean(marker.image) }); continue; }
  const record = {};
  const icon = categoryIcons[marker.category];
  if (icons[icon] && icon !== 'question_mark') record.iconPath = `maps/category-icons/gta6/${icon.replaceAll('_', '-')}.svg`;
  if (marker.image) {
    const url = new URL(marker.image, 'https://www.gtabase.com');
    if (url.hostname !== 'www.gtabase.com') throw new Error('Unexpected photo host');
    const bytes = await photoBytes(url);
    const image = await sharp(bytes).metadata();
    if (!image.width || !image.height) throw new Error('Invalid photo');
    const file = `maps/leonida/photos/${match.record.landmark.id.toLowerCase()}-game.${image.format === 'jpeg' ? 'jpg' : image.format}`;
    await saveAsset(file, bytes, url.href);
    record.gamePhoto = file;
  }
  records[match.record.landmark.id] = record;
  matched.push({ sourceId: marker.id, landmarkId: match.record.landmark.id, name: marker.name, distance: match.distance, ...record });
}
await fs.writeFile(mediaFile, JSON.stringify({ records, assets }, null, 2));
await fs.writeFile(path.join(cache, 'media-report.json'), JSON.stringify({ scanned: markers.length, availablePhotos: markers.filter(m => m.image).length, matched, unmatched, photos: matched.filter(m => m.gamePhoto).length }, null, 2));
await fs.writeFile(path.join(publicRoot, 'licenses/gta6-media.txt'), 'Marker symbols: Material Symbols by Google, Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Game-icons.net symbols by Caro Asercion, Delapouite, John Colburn, Lorc and Skoll, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Local SVG wrappers use an off-white fill.\nGame screenshots: Rockstar Games; publicly displayed location images on https://www.gtabase.com/gta-6/map/. Images are unmodified. Source-to-location mapping is retained in the internal import report.\n');
console.log(JSON.stringify({ scanned: markers.length, matched: matched.length, photos: matched.filter(m => m.gamePhoto).length, icons: assets.filter(asset => asset.path.endsWith('.svg')).length, unmatched: unmatched.length }));
