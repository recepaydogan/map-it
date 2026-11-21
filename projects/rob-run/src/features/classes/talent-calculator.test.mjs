import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { changeTalentRank, nextRankNumberChanges, resetTalentTree, restoreTalentOrder, talentCounts, talentLockReason, talentOrderGroups } from "./talent-calculator.ts";

const payload = JSON.parse(await readFile(new URL("../../../public/data/classes/talent-calculator.json", import.meta.url)));
const druid = payload.classes.find((entry) => entry.n === "Druid");
const balance = druid.trees[0];
const byName = (name) => balance.talents.find((talent) => talent.n === name);
const add = (order, name, times = 1) => Array.from({ length: times }).reduce((current) => changeTalentRank(druid.trees, current, byName(name).id, 1), order);

test("lower tiers open after five points in earlier tiers", () => {
  const wrath = byName("Improved Wrath");
  const moonglow = byName("Moonglow");
  let order = [];
  assert.equal(changeTalentRank(druid.trees, order, moonglow.id, 1), order);
  order = add(order, "Improved Wrath", 5);
  assert.equal(talentLockReason(balance, moonglow, talentCounts(order), order.length), null);
  order = add(order, "Moonglow");
  assert.equal(order.length, 6);
  assert.equal(changeTalentRank(druid.trees, order, wrath.id, -1), order);
});

test("prerequisite rank is required and protected during removal", () => {
  let order = add([], "Improved Wrath", 5);
  order = add(order, "Moonglow", 3);
  order = add(order, "Improved Moonfire", 2);
  const splendor = byName("Nature's Splendor");
  assert.equal(talentLockReason(balance, splendor, talentCounts(order), order.length)?.kind, "prerequisite");
  order = add(order, "Nature's Majesty", 2);
  order = add(order, "Nature's Splendor");
  assert.equal(talentCounts(order).get(splendor.id), 1);
  assert.equal(changeTalentRank(druid.trees, order, byName("Nature's Majesty").id, -1), order);
  const reset = resetTalentTree(balance, order);
  assert.equal(reset.length, 0);
});

test("51 point cap and chronological leveling order", () => {
  let order = [];
  const talents = druid.trees.flatMap((tree) => tree.talents);
  while (order.length < 51) {
    const next = talents.map((talent) => changeTalentRank(druid.trees, order, talent.id, 1)).find((candidate) => candidate !== order);
    assert.ok(next, `Allocation stopped at ${order.length}`);
    order = next;
  }
  assert.equal(changeTalentRank(druid.trees, order, talents[0].id, 1), order);
  const groups = talentOrderGroups(druid.trees, order);
  assert.equal(groups[0].from, 10);
  assert.equal(groups.at(-1).to, 60);
  assert.equal(groups[0].to, 14);
});

test("saved order survives removal of an earlier point when the final build stays valid", () => {
  let order = add([], "Improved Wrath", 5);
  order = add(order, "Moonglow");
  order = add(order, "Genesis", 5);
  order = changeTalentRank(druid.trees, order, byName("Improved Wrath").id, -1);
  assert.equal(order.length, 10);
  assert.deepEqual(restoreTalentOrder(druid.trees, order), order);
  assert.deepEqual(restoreTalentOrder(druid.trees, [...order, 999999]), []);
});

test("leveling order shows the rank reached by each step", () => {
  let order = add([], "Improved Wrath", 2);
  order = add(order, "Genesis");
  order = add(order, "Improved Wrath");
  const groups = talentOrderGroups(druid.trees, order);
  assert.deepEqual(groups.map(({ name, from, to, rankFrom, rankTo }) => ({ name, from, to, rankFrom, rankTo })), [
    { name: "Improved Wrath", from: 10, to: 11, rankFrom: 1, rankTo: 2 },
    { name: "Genesis", from: 12, to: 12, rankFrom: 1, rankTo: 1 },
    { name: "Improved Wrath", from: 13, to: 13, rankFrom: 3, rankTo: 3 },
  ]);
  assert.equal(groups[0].tree, "Balance");
  assert.equal(groups[0].maxRank, 5);
});

test("next rank shows only changed values", () => {
  assert.equal(nextRankNumberChanges(
    "Improves your chance to hit with Arcane spells by 2%.",
    "Improves your chance to hit with Arcane spells by 3%."), "2% → 3%");
  assert.equal(nextRankNumberChanges(
    "Reduces the cast time by 0.1 sec and mana cost by 10%.",
    "Reduces the cast time by 0.2 sec and mana cost by 20%."), "0.1 sec → 0.2 sec · 10% → 20%");
  assert.equal(nextRankNumberChanges(
    "Two effects improve by 2% and 2%.",
    "Two effects improve by 4% and 4%."), "2% → 4%");
});
