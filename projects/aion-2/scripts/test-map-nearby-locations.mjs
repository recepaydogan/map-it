import assert from "node:assert/strict";
import { groupNearbySameNameLocations } from "../src/features/map/map-nearby-locations.ts";

const point = (id, name, category, x, y) => ({
  id, name, category, x, y, label: "", subtype: category, regionId: "", region: "",
});

const source = [
  point("a", "Sentry", "enemy", 100, 100),
  point("b", "Sentry", "enemy", 110, 100),
  point("c", "Sentry", "enemy", 107, 108),
  point("d", "Sentry", "enemy", 200, 100),
  point("e", "Infantry", "enemy", 103, 100),
  point("f", "Sentry", "boss", 104, 100),
];

const grouped = groupNearbySameNameLocations(source, "enemy", 20);
assert.equal(grouped.length, 4);
const sentries = grouped.filter(({ name, category }) => name === "Sentry" && category === "enemy");
assert.equal(sentries.length, 2);
assert.deepEqual(sentries.map(({ occurrences }) => occurrences ?? 1).sort((a, b) => a - b), [1, 3]);
assert.equal(grouped.find(({ id }) => id === "f")?.category, "boss");
assert.equal(source[0].occurrences, undefined, "grouping must not mutate source locations");

const protectedGroup = groupNearbySameNameLocations(source, "enemy", 20, new Set(["b"]));
assert.equal(protectedGroup.find(({ id }) => id === "b")?.occurrences, undefined);
assert.equal(protectedGroup.filter(({ name, category }) => name === "Sentry" && category === "enemy").length, 3);

const variants = [
  { ...source[0], reference: { category: "creatures", id: "one" } },
  { ...source[1], reference: { category: "creatures", id: "two" } },
  { ...source[2], reference: { category: "creatures", id: "one" } },
];
const separate = groupNearbySameNameLocations(variants, "enemy", 20);
assert.equal(separate.length, 2, "Same-name enemy variants must retain their own level, souls and drops");
assert.equal(separate.find(p => p.reference.id === "one").occurrences, 2);
assert.equal(separate.find(p => p.reference.id === "two").occurrences, undefined);
assert.equal(groupNearbySameNameLocations([variants[0], source[1]], "enemy", 20).length, 2,
  "An unresolved marker must not conceal a verified enemy's data");

console.log("Nearby same-name map markers group without mixing identities or saved points.");
