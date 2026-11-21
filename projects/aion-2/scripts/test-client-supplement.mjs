import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { groupItemRecipes } from "../src/features/database/group-item-recipes.ts";
import { getItemRewardQuantity } from "../src/features/database/item-reward-quantity.ts";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const root = "public/data/reference/";
const audit = read(`${root}client-supplement.json`);
const index = new Map(read(`${root}index.json`).entries.map((entry) => [entry.id, entry]));
const catalog = read("public/data/items/catalog.json");
const items = new Map(catalog.items.map((item) => [item.id, item]));
const entry = (id) => {
  const summary = index.get(id);
  assert(summary, `Missing supplement identity: ${id}`);
  return read(`${root}${summary.category}/${summary.chunk}.json`).entries[id];
};
const section = (record, name) => record.sections.find((s) => s.title === `reference.labels.${name}`);
const itemSections = (id) => read(`${root}items/${id.slice(0, 3)}.json`).items[id];
assert.equal(new Set(catalog.items.map((i) => i.id)).size, catalog.items.length);
assert.equal(audit.build, "26262663");
assert.equal(audit.addedItemIds.length, 46);
for (const id of audit.retiredItemIds) assert(!items.has(id), `Retired item remains listed: ${id}`);
for (const id of audit.removedEntryIds) assert(!index.has(id), `Retired reference remains listed: ${id}`);
for (const id of audit.itemIds) {
  assert(items.has(id));
  assert(items.get(id).nameVerified);
  assert(existsSync(`public/${items.get(id).icon}`), `Missing exact icon for ${id}`);
}
for (const [id, count] of Object.entries(audit.boardNodes)) {
  const board = entry(`DaevanionBoard:${id}`);
  assert.equal(board.board.length, count);
  assert.equal(count, 153);
  assert.equal(new Set(board.board.map((n) => `${n.row}:${n.column}`)).size, count);
  assert.equal(board.board.filter((n) => n.automatic).length, 1);
  assert(board.board.every((n) => n.level === 45 && n.cost >= 0));
  assert.equal(board.board.find((n) => n.row === 1 && n.column === 1).bonuses[0].value, 1.5);
}
const recipes = audit.scope.recipeIds.map((id) => entry(`ConversionRecipe:${id}`));
assert.equal(groupItemRecipes(recipes).length, 5, "Equivalent factions merge; dungeon ingredients remain distinct");
for (const recipe of recipes) {
  const output = section(recipe, "produces").links[0];
  const input = section(recipe, "ingredients").links[0];
  assert(itemSections(output.id).some((s) => s.links?.some((l) => l.id === recipe.id)));
  assert(itemSections(input.id).some((s) => s.links?.some((l) => l.id === recipe.id)));
  if (output.id === "531900901") {
    assert.equal(input.quantity, 100);
    assert.equal(output.quantity, 1);
    assert.equal(recipe.facts.find((f) => f.label === "reference.labels.conversion-limit").value, 30);
    assert.match(items.get(input.id).name, /\(Bound\)$/);
  } else {
    assert.equal(input.quantity, 1);
    assert.equal(output.quantity, 5);
    const alternative = section(recipe, "alternative-ingredients").links[0];
    assert.equal(alternative.id, "632510902");
    assert.equal(alternative.quantity, 1);
  }
}
for (const [id, fragment, artwork] of [[600004, "632510901", "514310198"], [600033, "632510902", "514310199"], [600013, "632510903", "514310200"], [600073, "632510904", "514310201"]]) {
  const dungeon = entry(`Dungeon:${id}`);
  const rewards = section(dungeon, "possible-rewards").links;
  assert.equal(dungeon.adventure.difficulty, "hard");
  const fragmentReward = rewards.find((r) => r.id === fragment);
  assert.equal(fragmentReward.quantity, 60);
  assert.equal(fragmentReward.quantityMax, 90);
  assert.equal(getItemRewardQuantity(fragmentReward), "60–90");
  assert(rewards.some((r) => r.id === artwork));
  assert(rewards.every((r) => !r.rewardRates), "Raw weights must not become unsupported probabilities");
  assert.equal(section(dungeon, "guaranteed-rewards").summary.values.count, 28);
}
for (const id of [330101300, 430101300, 331101400, 431101400, 332101300, 432101300, 333101300, 433101300]) {
  const milestones = section(entry(`Achievement:${id}`), "milestones").rows;
  const expected = ["330", "430", "332", "432"].includes(String(id).slice(0, 3)) ? [5, 10, 15] : [5, 10, 15, 18, 21, 23, 25];
  assert.deepEqual(milestones.map((r) => r.facts.find((f) => f.label === "reference.labels.required-count").value), expected);
  assert(milestones.every((r) => r.description && r.links.length > 0));
}
const crystalLinks = itemSections("531900901").find((s) => s.title === "reference.labels.use-effect").links;
assert.equal(crystalLinks.length, 9);
assert(crystalLinks.every((l) => l.note), "Class variants must be distinguishable");
for (const [key, path] of [["catalog", "public/data/items/catalog.json"], ["iconSources", "public/data/items/icon-sources.json"]]) {
  const descriptor = read("public/data/items/source-manifest.json")[key];
  const bytes = readFileSync(path);
  assert.equal(descriptor.bytes, bytes.length);
  assert.equal(descriptor.sha256, createHash("sha256").update(bytes).digest("hex"));
}
assert.equal(entry("Skill:13310000").facts.find((f) => f.label === "reference.labels.cooldown-table-units").value, 60000);
assert.match(entry("Skill:13710000").description, /HP by 200/);
const hpLevels = section(entry("SkillAbnormal:137100001"), "skill-levels").rows;
for (const [level, hp] of [[1, 200], [5, 1000], [10, 2000], [20, 4000]]) {
  assert.equal(hpLevels.find((r) => r.name === String(level)).facts.find((f) => f.label === "reference.labels.hp").value, hp);
}
const craftedCape = section(entry("ExceedEnchant:Armor_Cape_Unique_70_Craft"), "upgrade-steps").rows;
assert.equal(Math.max(...craftedCape.map((r) => Number(r.name.slice(1)))), 3);
assert.equal(craftedCape.find((r) => r.name === "+1").facts.find((f) => f.label === "reference.labels.currency-cost").value, 900000);
assert.equal(entry("ContentsUnlock:18").facts.find((f) => f.label === "reference.labels.required-level").value, 45);
assert.equal(entry("MapEntrance:130").facts.find((f) => f.label === "reference.labels.maximum-players").value, 2000);
for (const id of [2320218, 2320812]) assert.equal(entry(`NpcData:${id}`).facts.find((f) => f.label === "reference.labels.berserk-time-table-units").value, 240);
const dailyRewards = section(entry("Dungeon:900002"), "faction-rewards-light").rows.flatMap((r) => r.links);
assert(dailyRewards.every((r) => r.id === "503700096"));
for (const cls of audit.scope.classes) {
  const stats = section(entry(`PcStatLevel:${cls}`), "progression").rows.find((r) => r.name === "45");
  assert.equal(stats.facts.find((f) => f.label === "reference.labels.hp").value, /Gladiator|Templar/.test(cls) ? 6202 : 5702);
}
console.log(`Client supplement valid: ${audit.addedItemIds.length} added items, ${audit.entryIds.length} linked records and ${recipes.length} recipes.`);
