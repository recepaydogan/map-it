import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { attemptBudget, upgradeBudget } from "../src/features/intelligence/upgrade-budget.ts";
import { itemSkillRolls, matchesSkillRoll } from "../src/features/intelligence/skill-rolls.ts";

const read = async path => JSON.parse(await readFile(path, "utf8"));
const root = "public/data/reference/intelligence";
const manifest = await read(`${root}/manifest.json`);
const reference = await read("public/data/reference/index.json");
const catalog = await read("public/data/items/catalog.json");
const identities = new Map(reference.entries.map(e => [e.id, e.category]));
for (const item of catalog.items) identities.set(item.id, "items");
const bounds = new Map();
const mapIds = new Set();
for (const slug of await readdir("public/maps")) {
  const metadata = await read(`public/maps/${slug}/metadata.json`);
  bounds.set(slug, metadata.bounds);
  if (metadata.worldProjection) mapIds.add(metadata.worldProjection.mapId);
}
let links = 0, points = 0;
function verifyTree(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.category === "string" && typeof value.id === "string") {
    // Skin categories are classification names, not reference links.
    if ("grade" in value) return Object.values(value).forEach(verifyTree);
    assert.equal(identities.get(value.id), value.category, `Broken link ${value.id}`);
    links++;
  }
  if ("mapId" in value && "x" in value) {
    const b = bounds.get(value.mapId);
    assert.ok(b && Number.isFinite(value.x) && Number.isFinite(value.y), `Invalid point ${value.mapId}`);
    assert.ok(value.x >= b.minX && value.x <= b.maxX && value.y >= b.minY && value.y <= b.maxY);
    points++;
  }
  Object.values(value).forEach(verifyTree);
}
const data = {};
for (const [name, expected] of Object.entries(manifest.outputs)) {
  const raw = await readFile(`${root}/${name}.json`);
  assert.equal(raw.length, expected.bytes);
  assert.equal(createHash("sha256").update(raw).digest("hex"), expected.sha256);
  data[name] = JSON.parse(raw);
  assert.equal(data[name].version, 1);
  verifyTree(data[name]);
}
const sourceManifest = await read("public/data/reference/manifest.json");
for (const table of manifest.tables) {
  const original = sourceManifest.tables.find(t => t.name === table.name);
  if (original) assert.equal(table.sha256, original.sha256, `Mixed source snapshots: ${table.name}`);
}

assert.deepEqual(attemptBudget(0.5, 0.5), { expected: 1.5, maximum: 2 });
assert.deepEqual(attemptBudget(0.5, 0), { expected: 2, maximum: null });
assert.deepEqual(attemptBudget(0.5, 0.5, 1), { expected: 1, maximum: 1 });
assert.equal(attemptBudget(0.65, 0.05).maximum, 8);
assert.throws(() => attemptBudget(0.5, 0.05, -1));
const step = level => ({ level, probability: 0.5, correction: 0.5, penalty: 0, gold: 100, currency: "Currency", costsComplete: true,
  materials: [{ id: "material", category: "items", name: "Material", level: 0, quantity: 2 }] });
const budget = upgradeBudget([step(0), step(1)], 0, 2, 1);
assert.equal(budget.gold, 250, "Correction only carries into the first selected level");
assert.equal(budget.maximumGold, 300);
assert.equal(budget.materials[0].expected, 5);
assert.equal(upgradeBudget([{ ...step(0), penalty: null }], 0, 1, 0).assumedPenalty, true);
assert.equal(upgradeBudget([{ ...step(0), penalty: 1 }], 0, 1, 0), null);
assert.equal(upgradeBudget([{ ...step(0), costsComplete: false }], 0, 1, 0), null);
assert.equal(upgradeBudget([step(0), { ...step(1), currency: "Other" }], 0, 2, 0), null);
assert.equal(upgradeBudget([step(0)], 0, 999999999, 0), null);
for (const steps of Object.values(data.upgrades.groups)) {
  assert.equal(new Set(steps.map(s => s.level)).size, steps.length);
  for (const s of steps.filter(s => s.probability > 0 && s.costsComplete)) {
    const result = upgradeBudget(steps, s.level, s.level + 1, 0);
    if (s.penalty !== null && s.penalty !== 0) {
      assert.equal(result, null, "A failure penalty needs a separate loss model");
      continue;
    }
    assert.ok(result && Number.isFinite(result.gold));
    assert.ok(result.maximumGold === null || result.maximumGold >= result.gold - 1e-7);
  }
}
const rolls = data["skill-rolls"];
assert.equal(Object.keys(rolls.items).length, 3248);
for (const id of Object.keys(rolls.items)) {
  assert.equal(identities.get(id), "items");
  const pool = itemSkillRolls(rolls, id);
  assert.ok(pool.length);
  assert.ok(matchesSkillRoll(rolls, id, pool[0].class, pool[0].skill.id));
  assert.ok(!matchesSkillRoll(rolls, id, "Unknown class", pool[0].skill.id));
  assert.ok(pool.every(r => r.maximum >= r.base));
}
assert.ok(matchesSkillRoll(rolls, "missing", "", ""));
assert.ok(!matchesSkillRoll(rolls, "missing", "Gladiator", ""));
assert.equal(Object.keys(data.titles.entries).length, 1504);
assert.ok(!("Title:39000045" in data.titles.entries));
assert.equal(data.titles.entries["Title:39000046"].items.length, 1);
assert.equal(data.titles.entries["Title:49000001"].items[0].id, "503700060");
assert.equal(data.titles.entries["Title:49000002"].items[0].id, "503700061");
assert.equal(Object.values(data.titles.entries).filter(title => title.artwork).length, 139);
assert.deepEqual(data.titles.entries["Title:11010001"].sources.map(l => l.id), ["Quest:1101030"]);
assert.equal(data.titles.entries["Title:11010001"].items[0].id, "532560001");
assert.equal(Object.values(data.titles.entries).filter(t => t.passive.length && t.faction === "Light").length, 419);
assert.equal(Object.values(data.titles.entries).filter(t => t.passive.length && t.faction === "Dark").length, 419);
assert.equal(Object.keys(data.companions.entries).length, 200);
assert.equal(Object.values(data.companions.entries).filter(c => c.sources.some(s => s.points.length)).length, 155);
assert.equal(Object.values(data.combat.entries).filter(c => c.berserkSeconds !== null).length, 384);
assert.equal(data.skins.skins.length, 1486);
assert.ok(data.skins.skins.every(s => s.name && s.items.every(i => i.category === "items")));
assert.ok(!("attributes" in manifest.outputs) && !("seals" in manifest.outputs) && !("artifacts" in manifest.outputs));
assert.equal(data.schedules.schedules.length, 22);
for (const schedule of data.schedules.schedules) {
  assert.ok(schedule.days.length && schedule.minutes.length);
  assert.equal(schedule.points.length > 0, mapIds.has(schedule.sourceMapId), "Available schedule regions need valid map points");
  assert.ok(schedule.minutes.every(m => Number.isInteger(m) && m >= 0 && m < 1440));
}
console.log(`Player tools: ${Object.keys(manifest.outputs).length} verified payloads, ${links} valid reference links, ${points} bounded map points; upgrade budgets, class filters and snapshot regressions passed.`);
