import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const [stageArgument, enrichedArgument] = process.argv.slice(2);
if (!stageArgument || !enrichedArgument) throw new Error('Usage: finalize-bounded-peak-stage.mjs <stage> <enriched-catalog>');
const stage = resolve(stageArgument);
const original = JSON.parse(await readFile(join(stage, 'catalog.json')));
const enriched = JSON.parse(await readFile(resolve(enrichedArgument)));
assert.deepEqual(enriched.source, original.source);
assert.deepEqual(enriched.dailyWindow, original.dailyWindow);
const geometry = entry => ({ scene: entry.scene, seed: entry.seed, assetFile: entry.assetFile,
  assetBundle: entry.assetBundle, mapImage: entry.mapImage, projection: entry.projection,
  biomes: entry.biomes, variants: entry.variants, captureRootComponent: entry.captureRootComponent,
  markers: entry.markers.map(marker => ({ id: marker.id, world: marker.world, map: marker.map, biomeSlot: marker.biomeSlot })) });
assert.deepEqual([...enriched.levels, ...enriched.specialLevels].map(geometry),
  [...original.levels, ...original.specialLevels].map(geometry), 'Enrichment changed captured geometry');
assert.equal(enriched.items.length, original.items.length);
for (const item of enriched.items) {
  const previous = original.items.find(candidate => candidate.id === item.id && candidate.displayId === item.displayId);
  assert.ok(previous, 'Item identity changed');
  assert.deepEqual({ ...item, icon: previous.icon }, previous, 'Item metadata changed');
  item.icon = previous.icon;
}
enriched.itemIconCoverage = original.itemIconCoverage;
await writeFile(join(stage, 'catalog.json'), JSON.stringify(enriched));
console.log('Finalized item links and immutable icons; captured geometry and marker projections unchanged.');
