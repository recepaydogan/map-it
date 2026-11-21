import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupItemRecipes } from "../src/features/database/group-item-recipes.ts";

const index = JSON.parse(readFileSync("public/data/reference/index.json", "utf8"));
const summaries = index.entries.filter((entry) => entry.category === "recipes");
const entries = summaries.map((summary) => {
  const path = `public/data/reference/recipes/${summary.chunk}.json`;
  return { summary, path };
});
const chunks = new Map();
const recipes = entries.map(({ summary, path }) => {
  if (!chunks.has(path)) chunks.set(path, JSON.parse(readFileSync(path, "utf8")));
  return chunks.get(path).entries[summary.id];
});
const groups = groupItemRecipes(recipes);
assert(groups.length < recipes.length, "Equivalent faction recipes should merge");
const faction = "reference.labels.faction";
const example = recipes.find((entry) => entry.facts.some((fact) => fact.label === faction));
assert(example, "Fixture needs a faction recipe");
const original = JSON.stringify(example);
const variant = structuredClone(example);
variant.id += ":variant";
variant.facts.find((fact) => fact.label === faction).value = "Other faction";
const merged = groupItemRecipes([example, variant, variant]);
assert.equal(merged.length, 1);
assert.equal(merged[0].facts.find((fact) => fact.label === faction).value.split(" / ").length, 2);
assert.equal(JSON.stringify(example), original, "Grouping must not mutate cached data");
const differentCost = structuredClone(variant);
differentCost.sections.find((section) => section.title === "reference.labels.ingredients").links[0].quantity += 1;
assert.equal(groupItemRecipes([example, differentCost]).length, 2, "Different costs must stay separate");
const differentCondition = structuredClone(variant);
differentCondition.facts.push({ label: "reference.labels.conversion-limit", value: 12345 });
assert.equal(groupItemRecipes([example, differentCondition]).length, 2, "Different conditions must stay separate");
const differentOutput = structuredClone(variant);
differentOutput.sections.find((section) => section.title === "reference.labels.produces").links[0].id += ":other";
assert.equal(groupItemRecipes([example, differentOutput]).length, 2, "Different outputs must stay separate");
const first = structuredClone(example);
const second = structuredClone(variant);
const comboA = structuredClone(example);
const comboB = structuredClone(variant);
comboA.id = "combo-a";
comboB.id = "combo-b";
for (const [parent, combo] of [[first, comboA], [second, comboB]]) {
  parent.sections = parent.sections.filter((section) => section.title !== "reference.labels.combo-recipe");
  parent.sections.push({ title: "reference.labels.combo-recipe", links: [{ id: combo.id, category: "recipes", name: combo.name }] });
}
const all = new Map([first, second, comboA, comboB].map((entry) => [entry.id, entry]));
const comboGroups = groupItemRecipes([first, second], all);
assert.equal(comboGroups.length, 1, "Equivalent faction combo IDs must not duplicate the parent recipe");
assert.equal(comboGroups[0].sections.at(-1).links.length, 2, "Both faction combo variants must remain available");
comboB.facts.push({ label: "reference.labels.success-chance", value: 12 });
assert.equal(groupItemRecipes([first, second], all).length, 2, "Different combo success conditions must not merge");
console.log(`Recipe grouping checks passed (${recipes.length} recipes, ${groups.length} distinct variants).`);
