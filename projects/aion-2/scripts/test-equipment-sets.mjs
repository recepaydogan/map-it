import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { groupEquipmentSetPieces } from "../src/features/reference/group-equipment-set-pieces.ts";

const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const { items } = await read("public/data/items/catalog.json");
const grades = ["Common", "Rare", "Epic", "Unique"];
let count = 0;
for (const file of await readdir("public/data/reference/sets")) {
  const { entries } = await read(`public/data/reference/sets/${file}`);
  for (const entry of Object.values(entries)) {
    const links = entry.sections.find((section) => section.title === "reference.labels.set-pieces").links;
    const groups = groupEquipmentSetPieces([...links].reverse(), items, grades);
    assert.equal(groups.length, 5, "The exported sets have five equipment types, not twenty pieces");
    assert.equal(groups.flatMap((group) => group.variants).length, links.length, "Every quality must remain reachable");
    for (const group of groups) {
      assert.deepEqual(group.variants.map((item) => item.grade), grades);
      for (const item of group.variants) {
        if (item.nameVerified) {
          assert.equal(item.nameOrigin, undefined, "Official names must replace descriptive fallback metadata");
          assert.ok(item.name.trim().length > 0);
        } else {
          assert.equal(item.name, `${entry.name} · ${group.category}`);
          assert.equal(item.nameOrigin, "set");
        }
        assert.equal(links.find((link) => link.id === item.id).name, item.name);
      }
    }
    count++;
  }
}
assert.equal(count, 2);

const item = (id, grade, itemLevel) => ({ id, grade, itemLevel, category: "Ring" });
const variants = [item("special", "Future grade", 80), item("high", "Rare", 40), item("low", "Rare", 20)];
const links = variants.map(({ id }) => ({ id, category: "items" }));
assert.deepEqual(groupEquipmentSetPieces([...links, links[0]], variants, grades)[0].variants.map(({ id }) => id), ["low", "high", "special"]);
assert.throws(() => groupEquipmentSetPieces([{ id: "missing", category: "items" }], [], grades), /Missing equipment set item/);
console.log("Equipment set grouping, quality selection data and readable names verified.");
