import assert from "node:assert/strict";
import {
  createCraftingLookups,
  resolveCraftIngredientItems,
  searchCraftRecipes,
} from "../src/features/map/crafting-planner/crafting-utils.ts";

const recipes = [{
  id: "Base:MakeCrate",
  recipeId: "MakeCrate",
  name: "Make Crate",
  category: "Carpentry",
  inputs: [],
  outputs: [{ itemId: "Base.Crate", amount: 1 }],
  skills: [],
  requiresLearning: false,
}];
const items = [
  { id: "Base.Hammer", name: "Hammer", lootable: true, tags: ["base:hammer"] },
  { id: "Base.StoneHammer", name: "Stone Hammer", lootable: true, tags: ["base:hammer"] },
  { id: "Base.Crate", name: "Wooden Crate", lootable: false, tags: [] },
];
const lookups = createCraftingLookups(items, [
  { id: "Base.Hammer", bestWeight: 80, locationCount: 50, profileIds: ["room:garage"] },
  { id: "Base.StoneHammer", bestWeight: 30, locationCount: 10, profileIds: ["room:shed"] },
], recipes);

assert.deepEqual(
  resolveCraftIngredientItems({
    kind: "tag",
    options: ["base:hammer"],
    amount: 1,
    consumed: false,
  }, lookups).map(({ item }) => item.id),
  ["Base.Hammer", "Base.StoneHammer"],
);
assert.equal(searchCraftRecipes(recipes, "wooden crate", lookups)[0]?.id, "Base:MakeCrate");

console.log("Crafting planner lookup and search tests passed.");
