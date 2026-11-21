import assert from 'node:assert/strict';
import test from 'node:test';
import { curateLandmarks } from './curate-gta6-landmarks.mjs';
import { classifyLandmark } from './curate-gta6-landmarks.mjs';

const place = (id, name, address, x, y, extra = {}) => ({
  id: `leonida-${id.toLowerCase()}`, name, x, y,
  landmark: { id, inGameAddress: address, realWorldAddress: '', tags: [],
    nameStatus: name.startsWith('L') ? 'unknown' : 'confirmed',
    gameCoordinates: { x, y: -y }, ...extra },
});

test('source updates merge anonymous details without adding areas or hiding named places', () => {
  const rows = [
    place('L2', 'L2 · County', '?, County', 20, 0),
    place('L1', 'L1 · County', '?, County', 0, 0),
    place('L3', 'L3 · Island', '?, Island', 2000, 0),
    place('L4', 'Water Tower', 'Water Tower, County', 10, 0),
  ];
  const policy = { mergeOnlyAnonymousIds: ['L2', 'L3', 'L4'] };
  const result = curateLandmarks(rows, policy);
  assert.deepEqual(result.records.map(r => r.name), ['County', 'Water Tower']);
  assert.equal(result.records[0].id, 'leonida-l1');
  assert.equal(result.aliases['leonida-l2'], 'leonida-l1');
  assert.equal(result.report.hiddenAnonymous, 1);
  assert.deepEqual(result.audit.flatMap(r => r.ids).sort(), ['L1', 'L2', 'L3', 'L4']);
  const namedLater = rows.map(r => r.landmark.id === 'L3'
    ? place('L3', 'Island Cafe', 'Island Cafe, Island', 2000, 0) : r);
  assert(curateLandmarks(namedLater, policy).records.some(r => r.name === 'Island Cafe'));
});

test('updated named venues retain meaningful categories', () => {
  assert.equal(classifyLandmark(place('L438', 'Dock Ring', 'Dock Ring, Shoreline', 0, 0,
    { tags: ['#ferriswheel', 'leisure'] })), 'place-leisure');
  assert.equal(classifyLandmark(place('L3411', 'RES TRADE PAINT', 'RES TRADE PAINT, La Perle', 0, 0)), 'place-retail');
  assert.equal(classifyLandmark(place('L3416', 'The Atoll Bar & Grill', 'The Atoll Bar & Grill, Ocean Beach', 0, 0)), 'place-restaurant');
});

test('explicit compound components merge without swallowing named businesses', () => {
  const records = [
    place('L1', 'Airport', 'Airport, Leonida', 0, 0),
    place('L2', 'L2 · Airport', '?, Airport, Leonida', 40, 0),
    place('L3', 'Terminal', 'Terminal, Airport, Leonida', 60, 0),
    place('L4', 'Coffee Shop', 'Coffee Shop, Airport, Leonida', 50, 0),
  ];
  const result = curateLandmarks(records);
  assert.deepEqual(result.records.map(r => r.name).sort(), ['Airport', 'Coffee Shop']);
  const airport = result.records.find(r => r.name === 'Airport');
  assert.deepEqual(airport.aliasIds, ['leonida-l2', 'leonida-l3']);
  assert.deepEqual([airport.x, airport.y], [0, 0]);
  assert.equal(result.aliases['leonida-l2'], airport.id);
});

test('nearby branches need shared site evidence; distant same-name places stay separate', () => {
  const records = [
    place('L1', 'Xero Gas Station', 'Xero Gas Station, Vice City', 0, 0),
    place('L2', 'Xero Gas Station', 'Xero Gas Station, Vice City', 70, 0),
    place('L3', 'Oceanarium', 'Oceanarium, Key', 1000, 0),
    place('L4', 'Oceanarium', 'Oceanarium, Key', 1100, 0),
    place('L5', 'Oceanarium', 'Oceanarium, Key', 4000, 0),
  ];
  const result = curateLandmarks(records);
  assert.equal(result.records.filter(r => r.name === 'Xero Gas Station').length, 2);
  assert.equal(result.records.filter(r => r.name === 'Oceanarium').length, 2);
  assert.equal(result.records.find(r => r.id === 'leonida-l3').memberIds.length, 2);
});

test('region references remain visible while numbered room references are omitted', () => {
  const records = [place('L1', 'L1 · County', '?, County', 0, 0),
    place('L2', 'Room 19', 'Room 19, County', 2000, 0),
    place('L3', 'Museum', 'Museum, County', 4000, 0)];
  const before = structuredClone(records);
  const result = curateLandmarks(records);
  assert.deepEqual(result.records.map(r => r.name), ['County', 'Museum']);
  assert.equal(result.records[0].areaLabel, true);
  assert.equal(result.records[0].landmark.nameStatus, 'unknown');
  assert.equal(result.report.hiddenAnonymous, 0);
  assert.equal(result.report.hiddenTechnical, 1);
  assert.deepEqual(result.audit.flatMap(r => r.ids).sort(), ['L1', 'L2', 'L3']);
  assert.deepEqual(records, before, 'The original catalog must remain untouched');
});

test('two Kelly County area markers coexist with the named facilities and towers', () => {
  const records = [
    place('L3391', 'L3391 · Kelly County', '?, Kelly County', 0, 0),
    place('L3392', 'L3392 · Kelly County', '?, Kelly County', 40, 0),
    place('L1082', 'L1082 · Kelly County', '?, Kelly County', 300, 0),
    place('L1083', 'L1083 · Kelly County', '?, Kelly County', 350, 0),
    place('L527', 'Prison', 'Prison, Kelly County', 10, 0),
    place('L278', 'Warehouse', 'Warehouse, Kelly County', 310, 0),
    place('L280', 'Water Tower', 'Water Tower, Kelly County', 20, 0),
    place('L279', 'Cell Tower', 'Cell Tower, Kelly County', 320, 0),
  ];
  const result = curateLandmarks(records);
  assert.equal(result.records.filter(r => r.name === 'Kelly County').length, 2);
  for (const name of ['Prison', 'Warehouse', 'Water Tower', 'Cell Tower']) {
    assert.equal(result.records.filter(r => r.name === name).length, 1);
  }
  assert.equal(result.records.length, 6);
});

test('a named water tower survives even inside an explicitly addressed parent site', () => {
  const result = curateLandmarks([
    place('L1', 'Airport', 'Airport, County', 0, 0),
    place('L2', 'Water Tower', 'Water Tower, Airport, County', 20, 0),
    place('L3', 'Bus Stop', 'Bus Stop, Airport, County', 30, 0),
  ]);
  assert.deepEqual(result.records.map(r => r.name), ['Airport', 'Water Tower', 'Bus Stop']);
});

test('matched descriptions survive a merged site without spreading to another location', () => {
  const result = curateLandmarks([
    place('L1', 'Oceanarium', 'Oceanarium, Key', 0, 0),
    place('L2', 'Oceanarium', 'Oceanarium, Key', 40, 0, { description: 'A marine park on the island.' }),
    place('L3', 'Coffee Shop', 'Coffee Shop, Key', 50, 0),
    place('L4', 'Oceanarium', 'Oceanarium, Key', 4000, 0),
  ]);
  assert.equal(result.records.find(r => r.id === 'leonida-l1').landmark.description, 'A marine park on the island.');
  assert.equal(result.records.find(r => r.id === 'leonida-l3').landmark.description, undefined);
  assert.equal(result.records.find(r => r.id === 'leonida-l4').landmark.description, undefined);
});

test('a GTADB town anchor keeps its own coordinates and groups other town references', () => {
  const rows = [
    place('L1', 'L1 · Capri', '?, Capri', 800, 0),
    place('L2', 'L2 · Capri', '?, Capri', 40, 0),
    place('L3', 'Coffee Shop', 'Coffee Shop, Capri', 45, 0),
  ];
  const result = curateLandmarks(rows, { townAnchorIds: ['L2'] });
  const town = result.records.find(r => r.name === 'Capri');
  assert.deepEqual([town.id, town.category, town.x, town.y], ['leonida-l2', 'place-town', 40, 0]);
  assert.equal(result.aliases['leonida-l1'], town.id);
  assert(result.records.some(r => r.name === 'Coffee Shop'));
});
