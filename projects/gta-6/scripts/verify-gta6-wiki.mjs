import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const catalog = JSON.parse(await fs.readFile('public/data/gta6/wiki/catalog.json', 'utf8'));
const seeds = JSON.parse(await fs.readFile('artifacts/gta6-wiki-import/seeds.json', 'utf8'));
const artworkSource = new Map(JSON.parse(await fs.readFile('artifacts/gta6-wiki-import/provenance.json', 'utf8')).map(entry => [entry.id, entry.imageUrl]));
assert.equal(catalog.version, 1);
assert.deepEqual(catalog.records.map(r => r.id).sort(), seeds.map(r => r.id).sort());
assert.equal(new Set(catalog.records.map(r => r.id)).size, catalog.records.length);
const counts = {};
let imageFiles = 0;
for (const entry of catalog.records) {
  counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  assert(entry.name.trim() && entry.category.trim(), `Missing identity: ${entry.id}`);
  assert(entry.description.length > 0, `Missing description: ${entry.id}`);
  assert(!JSON.stringify(entry).includes('www.gtabase.com'), 'Keep import provenance in artifacts');
  for (const value of [entry.name, ...entry.description, ...entry.facts.map(f => f.value)]) {
    assert(!/<\/?(?:script|iframe|a|img|div|p)\b/i.test(value), `Unparsed markup: ${entry.id}`);
    assert(!/\[snippet\b|^Track Your GTA 6 & GTA Online Garages/i.test(value), `Unparsed page content: ${entry.id}`);
    assert(!value.includes('\ufffd'), `Invalid text encoding: ${entry.id}`);
  }
  for (const fact of entry.facts) {
    assert(fact.value && !/^(?:coming soon\.?|unknown|tba|tbd|n\/?a|-+)$/i.test(fact.value), `Placeholder field: ${entry.id}`);
    assert.notEqual(fact.label, 'Rating', 'Editorial voting is not a game statistic');
  }
  if (!entry.image && !entry.thumbnail) {
    assert(/(?:\/|_)tba(?:_\d+x\d+)?\.(?:jpe?g|avif|webp)$/i.test(new URL(artworkSource.get(entry.id)).pathname), `Missing artwork: ${entry.id}`);
    continue;
  }
  assert(entry.image && entry.thumbnail, `Incomplete artwork: ${entry.id}`);
  for (const image of [entry.image, entry.thumbnail]) {
    assert(image.startsWith(`maps/wiki/${entry.kind}/`) && !image.includes('..'));
    const info = await sharp(await fs.readFile('public/' + image)).metadata();
    assert.equal(info.format, 'webp');
    assert(info.width >= 100 && info.width <= (image === entry.thumbnail ? 420 : 1200));
    imageFiles++;
  }
}
for (const kind of ['weapons', 'vehicles', 'characters']) {
  assert(counts[kind] > 0, `Empty collection: ${kind}`);
  assert.equal(counts[kind], seeds.filter(seed => seed.kind === kind).length);
}
console.log(JSON.stringify({ status: 'passed', counts, images: imageFiles }));
