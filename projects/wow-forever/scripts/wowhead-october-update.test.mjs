import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));

test("hunter pet markers preserve every source location, family and ability", async () => {
  const source = (await readFile("data/site-research/wowhead-forever-world-map-2026-10-27.js", "utf8")).replace(/^\uFEFF/, "");
  const data = new Map(source.trim().split(/\r?\n/).map((line) => {
    const match = /^WH\.setPageData\("wow\.worldMap\.classicplus\.([^"]+)",([\s\S]*)\);$/.exec(line);
    assert.ok(match);
    return [match[1], JSON.parse(match[2])];
  }));
  const categories = data.get("categories").filter((entry) => entry.group === "hunter-pets");
  const sourcePois = data.get("pois").filter((entry) => entry.category.startsWith("hunter-pet-"));
  const locations = (await json("public/maps/world-atlas/locations-forever-hunter-pets.json")).locations;
  assert.equal(categories.length, 18);
  assert.equal(locations.length, sourcePois.length);
  assert.equal(new Set(locations.map((point) => point.id)).size, locations.length);
  for (const [index, point] of locations.entries()) {
    const poi = sourcePois[index];
    const family = categories.find((category) => category.key === point.category);
    assert.equal(point.entityId, String(poi.npc));
    assert.equal(point.reference, undefined);
    assert.equal(point.petLevels, poi.levels || undefined);
    assert.deepEqual(point.petAbilities, family.abilities.map(([id, name]) => ({ id, name })));
  }
});

test("the confirmed quest and Mage changes agree between database and calculator", async () => {
  const quest = (await json("public/data/quests/quest-details.json")).quests["92749"];
  assert.match(quest.objective, /10 Rough Dynamite/);
  const classes = (await json("public/data/classes/talent-calculator.json")).classes;
  const frost = classes.find((entry) => entry.n === "Mage").trees.find((entry) => entry.n === "Frost");
  const chill = frost.talents.find((entry) => entry.n === "Winter's Chill");
  const spell = (await json("public/data/spells/foreverdb/44.json"))["11180"];
  assert.deepEqual(chill.d, spell.rk);
  assert.ok(chill.d.every((rank) => rank.includes("by 20%") && rank.includes("additional 7%")));
});
