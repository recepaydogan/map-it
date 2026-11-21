import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const generated = await read('scripts/data/gta6-generated-marker-artwork.json');
const before = await read('artifacts/gta6-generated-icons/landmarks-before.json');
const after = await read('public/data/gta6/landmarks.json');
const removeArtwork = rows => rows.map(({ iconPath: _icon, ...record }) => record);
assert.deepEqual(removeArtwork(after.records), removeArtwork(before.records), 'Only artwork may change in the location catalog');
const expected = new Set(Object.values(generated.symbols));
for (const record of after.records) assert(expected.has(record.iconPath), `Legacy icon remains: ${record.name}`);
const bundled = await build({ stdin: { contents: 'export { MAP_CATEGORIES, USER_MARKER_ICONS } from "./src/features/map/map-config.ts";', resolveDir: root }, bundle: true, platform: 'node', format: 'esm', write: false, define: { 'import.meta.env': '{"BASE_URL":"/","VITE_CONTENT_BASE_URL":""}' } });
const { MAP_CATEGORIES, USER_MARKER_ICONS } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
for (const category of [...MAP_CATEGORIES, ...USER_MARKER_ICONS]) {
  assert(expected.has(category.nativeIconPath), `Legacy category or personal icon: ${category.id}`);
}
let bytes = 0;
for (const relative of expected) {
  const file = path.join(root, 'public', relative);
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 128, relative);
  assert.equal(metadata.height, 128, relative);
  assert(metadata.hasAlpha, relative);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, opaque = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    if (data[offset] === 0) transparent++;
    if (data[offset] > 200) opaque++;
  }
  assert(transparent > 0.12 * info.width * info.height, `Background is not transparent: ${relative}`);
  assert(opaque > 0.08 * info.width * info.height, `Empty icon: ${relative}`);
  bytes += (await fs.stat(file)).size;
}
const report = { images: expected.size, mappedSymbols: Object.keys(generated.symbols).length,
  records: after.records.length, unchangedLocationData: true, totalPngBytes: bytes };
await fs.writeFile(path.join(root, 'artifacts/gta6-generated-icons/verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
