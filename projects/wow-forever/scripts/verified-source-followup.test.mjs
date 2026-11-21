import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { talentCounts, talentLockReason, changeTalentRank } from "../src/features/classes/talent-calculator.ts";
const read = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const calculator = await read("public/data/classes/talent-calculator.json");
const mage = calculator.classes.find((cls) => cls.n === "Mage");

test("all Mage talent IDs, slots and rank counts agree with readable client rows", async () => {
  const client = await read("data/site-research/wowhead-verified-update-2026-10-21/client-followup.json");
  assert.equal(client.source.build, 70450);
  assert.equal(mage.trees.flatMap((tree) => tree.talents).length, client.mage.length);
  const offsets = { Arcane: 1020, Fire: 5020, Frost: 9080 };
  for (const tree of mage.trees) {
    assert.equal(new Set(tree.talents.map((talent) => `${talent.row}:${talent.col}`)).size, tree.talents.length);
    for (const talent of tree.talents) {
      const native = client.mage.find((node) => node.id === talent.id);
      assert(native, talent.n);
      assert.equal(talent.row, (native.row[3].data - 2130) / 600, talent.n);
      assert.equal(talent.col, (native.row[2].data - offsets[tree.n]) / 600, talent.n);
      assert.equal(talent.ranks.length, native.entries[0].row[2].data, talent.n);
    }
  }
});

test("Arcane Wrath requires fifteen lower points and Arcane Blast", () => {
  const tree = mage.trees.find((entry) => entry.n === "Arcane");
  const wrath = tree.talents.find((talent) => talent.id === 113627);
  assert.equal(talentLockReason(tree, wrath, new Map(), 0).kind, "tier");
  let order = [];
  for (const talent of tree.talents.filter((entry) => entry.row < 3 && entry.id !== 105806)) {
    for (let rank = 0; rank < talent.ranks.length && order.length < 15; rank++) {
      order = changeTalentRank(mage.trees, order, talent.id, 1);
    }
  }
  assert.equal(order.length, 15);
  assert.equal(talentLockReason(tree, wrath, talentCounts(order), order.length).kind, "prerequisite");
  order = changeTalentRank(mage.trees, order, 105806, 1);
  assert.equal(talentLockReason(tree, wrath, talentCounts(order), order.length), null);
  order = changeTalentRank(mage.trees, order, wrath.id, 1);
  assert.equal(talentCounts(order).get(wrath.id), 1);
  assert.deepEqual(changeTalentRank(mage.trees, order, 105806, -1), order);
});

test("quest updates agree across panels and unverified values are omitted", async () => {
  const details = await read("public/data/quests/quest-details.json");
  assert.equal(details.quests["79361"].level, 43);
  assert.equal(details.quests["79361"].experience, 3600);
  assert.equal(details.quests["79361"].money, "60s");
  assert(details.quests["93689"] && details.quests["92459"]);
  assert.equal(details.quests["92521"].level, undefined);
  for (const name of ["quest-givers", "new-quest-givers", "quests"]) {
    const layer = await read(`public/maps/world-atlas/locations-forever-all-${name}.json`);
    for (const point of layer.locations) {
      for (const offer of point.questOffers ?? []) if (offer.id === "79361") assert.equal(offer.level, 43);
      if (point.questId === "79361") assert.equal(point.questLevel, 43);
      if (point.entityId === "10305") assert.equal(point.questInfo.faction, "Neutral");
    }
  }
  const frigid = (await read(`public/data/spells/foreverdb/${1326891 % 64}.json`))[1326891];
  assert.equal(frigid.ef, undefined);
  const wind = (await read(`public/data/spells/foreverdb/${1326608 % 64}.json`))[1326608];
  assert.equal(wind.ic, 1029585);
  assert.equal(wind.ef[0].e, 5);
});
