import assert from "node:assert/strict";
import { groupBoxListings, groupBoxVariants } from "../src/features/reference/reward-box-variants.ts";

const variant = (id, faction, reward = "same", min = 1) => ({
  id, flattened: false,
  facts: [
    { label: "reference.labels.faction", value: faction },
    { label: "reference.labels.minimum-level", value: min },
    { label: "reference.labels.maximum-level", value: 100 },
  ],
  sections: [{ title: "reference.labels.contents", links: [{ id: reward, quantity: 1 }] }],
});

assert.equal(groupBoxVariants([variant("a", "Light"), variant("b", "Dark")]).length, 1);
assert.equal(groupBoxVariants([variant("a", "Light"), variant("b", "Dark", "other")]).length, 2);
assert.equal(groupBoxVariants([variant("a", "Light"), variant("b", "Light", "same", 50)]).length, 2);
const groups = groupBoxVariants([variant("a", "Light"), variant("b", "Dark"), variant("c", "Light", "other")]);
assert.equal(groups.find((group) => group.some((entry) => entry.id === "b"))[0].id, "a");
console.log("Reward box variant tests passed.");

const listings = groupBoxListings([
  { id: "a", name: "Same name", technical: false, variantIds: ["a1"] },
  { id: "b", name: "Same name", technical: false, variantIds: ["b1"] },
  { id: "c", name: "Same name", technical: true, variantIds: ["c1"] },
]);
assert.equal(listings.length, 2);
assert.deepEqual(listings[0].flatMap((entry) => entry.variantIds), ["a1", "b1"]);
assert.equal(listings[1][0].technical, true);
