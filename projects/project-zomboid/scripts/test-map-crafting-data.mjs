import assert from "node:assert/strict";
import { buildMapCraftingData } from "./map-crafting-data.mjs";

const crafting = buildMapCraftingData([`module Base
{
  craftRecipe MakeThing
  {
    category = Survival,
    SkillRequired = Woodwork:2;Maintenance:1,
    NeedToBeLearn = true,
    inputs
    {
      item 2 [Base.Plank;Base.Sapling],
      item 1 tags[base:hammer] mode:keep,
    }
    outputs
    {
      item 1 Base.Thing,
    }
  }
}`], { MakeThing: "Make Thing" });

assert.equal(crafting.totalRecipes, 1);
assert.equal(crafting.outputItems, 1);
assert.deepEqual(crafting.recipes[0], {
  id: "Base:MakeThing",
  kind: "craft",
  recipeId: "MakeThing",
  name: "Make Thing",
  category: "Survival",
  inputs: [
    { kind: "item", options: ["Base.Plank", "Base.Sapling"], amount: 2, consumed: true },
    { kind: "tag", options: ["base:hammer"], amount: 1, consumed: false },
  ],
  outputs: [{ itemId: "Base.Thing", amount: 1 }],
  skills: [{ id: "Woodwork", level: 2 }, { id: "Maintenance", level: 1 }],
  requiresLearning: true,
  dynamicIngredients: false,
});

console.log("Map crafting data tests passed.");
