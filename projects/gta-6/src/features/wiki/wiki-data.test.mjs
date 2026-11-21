import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({ entryPoints: ['src/features/wiki/wiki-data.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, define: { 'import.meta.env': '{}' } });
const { filterWikiEntries } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const records = [
  { id: 'v1', name: 'FCR 1000', kind: 'vehicles', manufacturer: 'Übermacht', category: 'Motorcycles', facts: [{ label: 'Based on', value: 'BMW R100' }] },
  { id: 'v2', name: 'Volatus', kind: 'vehicles', manufacturer: 'Buckingham', category: 'Helicopters', categories: ['Helicopters', 'Emergency'], facts: [] },
  { id: 'w1', name: 'Knife', kind: 'weapons', manufacturer: '', category: 'Melee', facts: [] },
];
test('search combines words, supports diacritics and searches real-world designs', () => {
  assert.deepEqual(filterWikiEntries(records, 'vehicles', 'ubermacht bmw', '', '').map(r => r.id), ['v1']);
  assert.equal(filterWikiEntries(records, 'weapons', 'BMW', '', '').length, 0);
});
test('class and manufacturer filters intersect rather than leaking other kinds', () => {
  assert.equal(filterWikiEntries(records, 'vehicles', '', 'Helicopters', 'Übermacht').length, 0);
  assert.equal(filterWikiEntries(records, 'vehicles', '', 'Motorcycles', 'Übermacht').length, 1);
  assert.deepEqual(filterWikiEntries(records, 'vehicles', '', 'Emergency', '').map(r => r.id), ['v2']);
  assert.deepEqual(filterWikiEntries(records, 'weapons', '', '', '').map(r => r.id), ['w1']);
});
