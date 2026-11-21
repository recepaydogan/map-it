import assert from "node:assert/strict";
import { planPersistentSubchunkViewport } from "../src/features/terrain/persistent-subchunk-viewport-plan.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const options = { focus: { x: 8, y: 70, z: 8 }, dimension: 0, minSectionY: -4, maxSectionY: 19 };

check("planner starts at the exact focus chunk and nearest vertical section", () => {
  const plan = planPersistentSubchunkViewport({ ...options, radiusChunks: 1, maxColumns: 9, maxSections: 27 });
  assert.deepEqual(plan.requests[0], { chunkX: 0, chunkZ: 0, dimension: 0, sectionY: 4 });
  assert.deepEqual(plan.requests.slice(0, 9).map(item => item.sectionY), new Array(9).fill(4));
  assert.deepEqual(plan.requests.slice(9, 18).map(item => item.sectionY), new Array(9).fill(5));
  assert.equal(plan.requests.length, 27); assert.equal(plan.columns.length, 9); assert.equal(plan.truncated, true);
});

check("negative block coordinates use floor division and retain the requested dimension", () => {
  const plan = planPersistentSubchunkViewport({ ...options, focus: { x: -0.01, y: -64, z: -16.01 },
    dimension: 2, radiusChunks: 0, maxSections: 2 });
  assert.equal(plan.focusChunkX, -1); assert.equal(plan.focusChunkZ, -2);
  assert.deepEqual(plan.requests, [
    { chunkX: -1, chunkZ: -2, dimension: 2, sectionY: -4 },
    { chunkX: -1, chunkZ: -2, dimension: 2, sectionY: -3 },
  ]);
});

check("horizontal ties are deterministic and duplicate-free", () => {
  const first = planPersistentSubchunkViewport({ ...options, radiusChunks: 2, maxColumns: 13, maxSections: 26 });
  const second = planPersistentSubchunkViewport({ ...options, radiusChunks: 2, maxColumns: 13, maxSections: 26 });
  assert.deepEqual(first, second);
  assert.equal(new Set(first.requests.map(item => JSON.stringify(item))).size, first.requests.length);
  assert.deepEqual(first.columns[0], { chunkX: 0, chunkZ: 0 });
  assert.deepEqual(first.columns.slice(1, 5), [
    { chunkX: 0, chunkZ: -1 }, { chunkX: -1, chunkZ: 0 },
    { chunkX: 1, chunkZ: 0 }, { chunkX: 0, chunkZ: 1 },
  ]);
});

check("complete bounded plans identify when no candidate was truncated", () => {
  const plan = planPersistentSubchunkViewport({ ...options, minSectionY: 0, maxSectionY: 1,
    radiusChunks: 0, maxColumns: 1, maxSections: 2 });
  assert.equal(plan.truncated, false); assert.equal(plan.requests.length, 2);
  assert(Object.isFrozen(plan) && Object.isFrozen(plan.requests) && plan.requests.every(Object.isFrozen));
  assert(Object.isFrozen(plan.columns) && plan.columns.every(Object.isFrozen));
});

check("invalid ranges, budgets and unsafe focus coordinates fail before allocation", () => {
  for (const change of [
    { focus: { x: Number.NaN, y: 0, z: 0 } }, { minSectionY: 1, maxSectionY: 0 },
    { minSectionY: -129 }, { maxSectionY: 128 }, { radiusChunks: 17 },
    { maxColumns: 0 }, { maxSections: 257 }, { dimension: 2 ** 31 },
    { focus: { x: 2 ** 36, y: 0, z: 0 } },
  ]) assert.throws(() => planPersistentSubchunkViewport({ ...options, ...change }), /persistent subchunk/i);
});

console.log(`${checks} persistent subchunk viewport planning checks passed.`);
