import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import sharp from 'sharp';

const stage = resolve(process.argv[2]);
const availableOnly = process.argv.includes('--available');
const catalog = JSON.parse(await readFile(join(stage, 'catalog.json')));
assert.equal(catalog.schemaVersion, 4);
const reports = [];
const previews = [];
const qa = join(stage, 'render-qa');
await mkdir(qa, { recursive: true });
for (const level of [...catalog.levels, ...catalog.specialLevels]) {
  const slug = basename(level.mapImage, '.webp');
  const overview = join(stage, 'maps', `${slug}.webp`);
  if (availableOnly && !await access(overview).then(() => true, () => false)) continue;
  const tiles = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const path = join(stage, 'maps', 'tiles', slug, `${column}-${row}.webp`);
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.width, 4096);
    assert.equal(metadata.height, 4096);
    tiles.push({ input: await sharp(path).resize(128, 128).removeAlpha().png().toBuffer(), left: column * 128, top: row * 128 });
  }
  const overviewMeta = await sharp(overview).metadata();
  assert.equal(overviewMeta.width, 4096);
  assert.equal(overviewMeta.height, 4096);
  const overviewPixels = await sharp(overview).resize(512, 512).removeAlpha().raw().toBuffer();
  const mosaic = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#1c4552' } })
    .composite(tiles).png().toBuffer();
  const mosaicPixels = await sharp(mosaic).removeAlpha().raw().toBuffer();
  let difference = 0;
  for (let index = 0; index < overviewPixels.length; index++) difference += Math.abs(overviewPixels[index] - mosaicPixels[index]);
  const meanDifference = difference / overviewPixels.length;
  assert.ok(meanDifference < 12, `Overview/tile inconsistency: ${slug}, mean RGB difference ${meanDifference}`);
  const stats = await sharp(overview).stats();
  assert.ok(stats.channels.some(channel => channel.stdev > 8), `Blank or nearly flat render: ${slug}`);
  const markerOverlay = Buffer.from(`<svg width="512" height="512">${level.markers
    .filter(marker => ['campfire', 'luggage', 'portal', 'respawn'].includes(marker.category))
    .map(marker => `<circle cx="${marker.map.x * 5.12}" cy="${marker.map.y * 5.12}" r="2" fill="none" stroke="#ffffff" stroke-width="0.7"/>`).join('')}</svg>`);
  await sharp(overview).resize(512, 512).composite([{ input: markerOverlay }]).png().toFile(join(qa, `${slug}-markers.png`));
  await writeFile(join(qa, `${slug}-mosaic.png`), mosaic);
  const label = Buffer.from(`<svg width="512" height="32"><rect width="512" height="32" fill="#171717"/><text x="10" y="23" font-size="18" fill="white">${level.kind}: ${level.scene}</text></svg>`);
  const thumbnail = await sharp(overview).resize(512, 512).extend({ top: 32, bottom: 0, left: 0, right: 0, background: '#171717' })
    .composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
  previews.push({ input: thumbnail, left: (previews.length % 4) * 512, top: Math.floor(previews.length / 4) * 544 });
  reports.push({ slug, meanDifference, markers: level.markers.length, dimensions: '4096x4096', tiles: 16 });
  console.log(`${slug}: 16 tiles, mean overview/mosaic difference ${meanDifference.toFixed(3)}`);
}
if (!availableOnly) assert.equal(reports.length, 14);
if (previews.length) await sharp({ create: { width: 2048, height: Math.ceil(previews.length / 4) * 544, channels: 3, background: '#171717' } })
  .composite(previews).png().toFile(join(qa, 'contact-sheet.png'));
await writeFile(join(qa, availableOnly ? 'partial-report.json' : 'report.json'), JSON.stringify(reports, null, 2));
