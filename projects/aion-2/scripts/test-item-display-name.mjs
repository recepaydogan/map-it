import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getItemDisplayName } from "../src/lib/item-display-name.ts";
import { getLocalizedMapPointDisplayName, getMapPointDisplayName } from "../src/features/map/map-point-display-name.ts";

for (const name of ["Soul: Kuru Worker (Bound)", "Reward (Bound) (Bound)", "Reward (bound) +3", "Hardbound Balaur Scale", "Pact-Bound Bow", "Ludra's Heavenbound Staff", "Bound", "Reward (7 Days)"]) {
  assert.equal(getItemDisplayName(name), name, "Names retain binding annotations and other qualifiers");
}
assert.equal(getItemDisplayName("Reward (Bound)", "Récompense (Liée)"), "Récompense (Liée)");
assert.equal(getItemDisplayName("Healing Potion (Bound)", "治癒のポーション(刻印)"), "治癒のポーション(刻印)");
assert.equal(getItemDisplayName("Reward (Bound)", "Recompensa"), "Recompensa (Bound)");
assert.equal(getItemDisplayName("Reward (Bound) (Bound)", "Récompense (Liée) (Liée)"), "Récompense (Liée) (Liée)");
assert.equal(getItemDisplayName("Pact-Bound Bow", "Arc lié par pacte"), "Arc lié par pacte");

const catalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const before = JSON.stringify(catalog);
const itemsByName = new Map(catalog.items.map(item => [item.name, item]));
for (const item of catalog.items) {
  const displayed = getItemDisplayName(item.name);
  assert.equal(displayed, item.name);
  assert.equal(getItemDisplayName(displayed), displayed);
}
const unbound = catalog.items.find(item => itemsByName.has(`${item.name} (Bound)`));
assert.ok(unbound, "Exercise actual bound and unbound variants");
const bound = itemsByName.get(`${unbound.name} (Bound)`);
assert.notEqual(getItemDisplayName(bound.name), getItemDisplayName(unbound.name), "Binding variants remain visually distinguishable");
assert.notEqual(bound.id, unbound.id, "Variants retain separate identities");
assert.equal(JSON.stringify(catalog), before, "Formatting must not rewrite source records or binding metadata");

const point = { id: "location", name: "Reward (Bound)", category: "collect-object", itemId: "item-1" };
assert.equal(getMapPointDisplayName(point), point.name);
assert.equal(getLocalizedMapPointDisplayName(point, () => "報酬(刻印)"), "報酬(刻印)");
assert.equal(getMapPointDisplayName({ id: "personal", name: point.name, category: "custom" }), point.name,
  "User-authored marker names remain literal");
assert.equal(getMapPointDisplayName({ ...point, itemId: undefined, reference: { category: "items", id: "item-1" } }), point.name);
console.log(`Item display-name checks passed for ${catalog.items.length} records; original names and distinct variant IDs retained.`);
