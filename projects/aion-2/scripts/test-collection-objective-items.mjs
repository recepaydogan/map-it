import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectionObjectiveSections } from "../src/features/reference/collection-objective-items.ts";

const entry = {
  id: "PeriodItemCollectionList:2012319",
  category: "collections",
  facts: [{ label: "reference.labels.required-count", value: 5 }],
  sections: [{ title: "reference.labels.required-items", links: [{ id: "610660035", quantity: 0 }] }],
};
assert.equal(collectionObjectiveSections(entry).at(0).links.at(0).quantity, 5);
assert.equal(entry.sections[0].links[0].quantity, 0, "Source data remains unchanged");
assert.deepEqual(collectionObjectiveSections({ ...entry, sections: [{ ...entry.sections[0], links: [{ id: "a", quantity: 0 }, { id: "b", quantity: 0 }] }] }).at(0).links.map(link => link.quantity), [5, 5]);
assert.equal(collectionObjectiveSections({ ...entry, facts: [] }).at(0).links.at(0).quantity, undefined);
assert.equal(collectionObjectiveSections({ ...entry, category: "recipes" }), entry.sections);

const collection = JSON.parse(await readFile("public/data/reference/intelligence/collections.json", "utf8"));
const objective = collection.objectives.find(row => row.target.id === entry.id && row.faction === "Dark");
assert.equal(objective.count, 5);
assert.deepEqual(objective.items, ["610660035"]);
console.log("Collection objective quantities verified");
