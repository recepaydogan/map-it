import assert from "node:assert/strict";
import { markerSupplementalDrops } from "../src/features/database/marker-supplemental-drops.ts";

const rate = { kind: "direct", percent: 25, quantityMin: 1, quantityMax: 1 };
const item = (id, name = "Equipment") => ({ id, name, category: "items", grade: "Rare", sourceScope: "specific" });
const groups = [{ kind: "main", items: [{ ...item("direct"), probability: 25000000 }], packages: [
  { probability: 100000000, count: 1, family: "armor", grade: "Rare", items: [{ ...item("pool"), probability: 100000000 }] },
] }];
const sections = [{ title: "reference.labels.possible-drops", links: [
  item("direct"), item("pool"), item("preview"), item("soul"),
  { ...item("rated"), rewardRates: [rate] }, item("bound", "Equipment (Bound)"), item("unbound", "Equipment"),
] }, { title: "reference.labels.guaranteed-drops", rows: [{ name: "", links: [item("nested")] }] },
{ title: "reference.labels.milestones", links: [item("achievement")] }];
const result = markerSupplementalDrops([item("direct"), item("pool"), item("preview"), item("rated"), item("soul")], groups, sections, ["soul"]);
assert.deepEqual(result.map((row) => row.id), ["preview", "rated", "bound", "unbound", "nested"]);
assert.deepEqual(result.find((row) => row.id === "rated").rewardRates, [rate]);
assert.equal(result.find((row) => row.id === "preview").rewardRates, undefined);
assert.equal(result.find((row) => row.id === "bound").name, "Equipment (Bound)");
assert(!result.some((row) => row.id === "achievement"));
assert(markerSupplementalDrops([item("direct")], [], sections, ["soul"]).some((row) => row.id === "direct"));
assert.deepEqual(markerSupplementalDrops([], [], []), []);
console.log("Supplemental loot retains unknown drops, rates and distinct item IDs without duplicating reward groups or souls.");
