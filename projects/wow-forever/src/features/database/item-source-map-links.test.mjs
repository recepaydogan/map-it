import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getItemSourceMapLocations, indexItemSourceMapLocations } from './item-source-map-links.ts';

const read = async path => JSON.parse(await readFile(new URL(`../../../public/${path}`, import.meta.url), 'utf8'));
const [catalog, sourceShard, rareLayer] = await Promise.all([
  read('data/map-search/index.json'), read('data/items/research/sources/0.json'), read('maps/world-atlas/locations-forever-all-rares.json'),
]);
const index = indexItemSourceMapLocations(catalog.locations);

test("item 6400 routes Ro'Bark to the actual loaded map marker without a prewritten link", () => {
  const source = sourceShard['6400'].find(source => source.npc === 14278);
  assert.equal(source.markerId, undefined);
  const locations = getItemSourceMapLocations(source, index);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].mapId, 'azeroth');
  assert.equal(locations[0].region, 'Hillsbrad Foothills');
  assert(rareLayer.locations.some(point => point.id === locations[0].markerId && point.entityId === '14278'));
  assert.equal(source.src, 'classic'); // A mapped NPC does not promote Classic loot to verified loot.
  assert.equal(source.pct, 0.5);
});

test('every mapped drop for the reported item resolves to its NPC identity', () => {
  const sources = sourceShard['6400'].filter(source => source.t === 'drop');
  assert(sources.length >= 6);
  for (const source of sources) {
    const available = catalog.locations.filter(({ point }) => point.entityId === String(source.npc));
    const resolved = getItemSourceMapLocations(source, index);
    if (available.length) assert(resolved.length, source.n);
    for (const target of resolved) assert(available.some(({ mapId, point }) => mapId === target.mapId && point.id === target.markerId), source.n);
  }
});

const location = (id, category, entityId, extra = {}) => ({ mapId: 'azeroth', mapName: 'Azeroth', count: 1,
  point: { id, category, entityId, name: "Same name", region: 'Region', ...extra } });

test('NPC IDs cannot collide with objects, item IDs or same-name creatures', () => {
  const index = indexItemSourceMapLocations([location('npc-1', 'rare', '1'), location('object-2', 'treasure', '2'), location('npc-3', 'npc', '3')]);
  assert.deepEqual(getItemSourceMapLocations({ t: 'drop', npc: 2, n: 'Same name' }, index), []);
  assert.deepEqual(getItemSourceMapLocations({ t: 'container', item: 1, n: 'Same name' }, index), []);
  assert.deepEqual(getItemSourceMapLocations({ t: 'drop', npc: 999, n: 'Same name' }, index), []);
});

test('all spawn locations are preserved and duplicate entries are removed', () => {
  const first = location('npc-1', 'rare', '1');
  const second = location('npc-2', 'rare', '1');
  const index = indexItemSourceMapLocations([first, second, first]);
  assert.deepEqual(getItemSourceMapLocations({ t: 'drop', npc: 1, mapId: 'azeroth', markerId: 'npc-1' }, index).map(x => x.markerId), ['npc-1', 'npc-2']);
});

test('quest rewards use exact offered quest IDs and vendors use NPC IDs', () => {
  const index = indexItemSourceMapLocations([
    location('giver', 'npc', '1', { questOffers: [{ id: '42', name: 'Quest' }] }),
    location('vendor', 'reagent-vendor', '2'),
  ]);
  assert.equal(getItemSourceMapLocations({ t: 'quest', q: 42 }, index)[0].markerId, 'giver');
  assert.deepEqual(getItemSourceMapLocations({ t: 'quest', q: 99, n: 'Quest' }, index), []);
  assert.equal(getItemSourceMapLocations({ t: 'vendor', npc: 2 }, index)[0].markerId, 'vendor');
});

test('explicit links survive a failed index request and alias addresses deduplicate', () => {
  const source = { t: 'drop', npc: 1, mapId: 'azeroth', markerId: 'old-pin' };
  assert.equal(getItemSourceMapLocations(source)[0].markerId, 'old-pin');
  const index = indexItemSourceMapLocations([location('current-pin', 'rare', '1', { aliasIds: ['old-pin'] })]);
  assert.deepEqual(getItemSourceMapLocations(source, index).map(x => x.markerId), ['current-pin']);
});

test('Break a Few Eggs has one Durotar location and old reward links use that same giver', () => {
  const giver = 'forever-all-quest-giver-3191-1';
  const offer = `forever-all-quest-815-${giver}`;
  for (const markerId of [undefined, offer, giver]) {
    const locations = getItemSourceMapLocations({ t: 'quest', q: 815, mapId: 'azeroth', markerId }, index);
    assert.deepEqual(locations.map(({ markerId, region }) => [markerId, region]), [[giver, 'Durotar']]);
    assert.equal(locations[0].questFaction, 'Horde');
  }
});

test('quest locations preserve distinct givers and standalone pins, independent of catalog order', () => {
  const offer = location('offer', 'quest', undefined, { questId: '42', questGiverMarkerId: 'giver-1', aliasIds: ['old-offer'] });
  const orphan = location('orphan', 'quest', undefined, { questId: '42', questGiverMarkerId: 'missing' });
  const first = location('giver-1', 'npc', '1');
  const second = location('giver-2', 'npc', '2', { questOffers: [{ id: '42', name: 'Quest' }] });
  const standalone = location('quest-pin', 'quest', undefined, { questId: '42' });
  const otherMap = { ...location('missing', 'npc', '3'), mapId: 'other-map' };
  const index = indexItemSourceMapLocations([offer, orphan, first, second, standalone, otherMap]);
  const resolved = getItemSourceMapLocations({ t: 'quest', q: 42, mapId: 'azeroth', markerId: 'old-offer' }, index);
  assert.deepEqual(resolved.map(x => x.markerId), ['giver-1', 'giver-2', 'quest-pin']);
});
