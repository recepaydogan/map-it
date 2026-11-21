import assert from "node:assert/strict";
import { withRecipeItemDetails } from "../src/features/database/recipe-item-details.ts";

const items = new Map([
  ["epic", { id: "epic", name: "Sample Amulet", grade: "Epic", description: "Can be upgraded via Substance Morph after enhancing it 10 times." }],
  ["unique", { id: "unique", name: "Sample Amulet", grade: "Unique" }],
]);
const sections = [
  { title: "reference.labels.produces", links: [{ category: "items", id: "unique", name: "Sample Amulet", quantity: 1 }] },
  { title: "reference.labels.ingredients", links: [{ category: "items", id: "epic", name: "Sample Amulet", quantity: 1 }] },
];
const format = (level) => `Requires enhancement +${level}`;
const conversion = withRecipeItemDetails({ group: "Conversion Recipe" }, sections, items, format);
assert.equal(conversion[0].links[0].note, "Unique");
assert.equal(conversion[1].links[0].note, "Epic · Requires enhancement +10");
assert.equal(conversion[1].links[0].id, "epic");
assert.equal(conversion[1].links[0].quantity, 1);
assert.equal(withRecipeItemDetails({ group: "Craft Recipe" }, sections, items, format)[1].links[0].note, "Epic");
