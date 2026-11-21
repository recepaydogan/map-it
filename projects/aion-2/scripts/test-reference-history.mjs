import assert from "node:assert/strict";
import { navigateReferenceHistory } from "../src/features/reference/reference-history.ts";

const bow = { category: "items", id: "bow", name: "Example Bow" };
const dungeon = { category: "dungeons", id: "dungeon", name: "Example Dungeon" };
const material = { category: "items", id: "material", name: "Example Material" };

// The visible search result, rather than the empty initial route, is the return target.
let history = navigateReferenceHistory([{ category: "items", id: "" }], bow, dungeon);
assert.deepEqual(history, [bow, dungeon]);
history = navigateReferenceHistory(history, dungeon, material);
assert.deepEqual(history, [bow, dungeon, material]);
assert.equal(history.slice(0, -1).at(-1).name, dungeon.name);
assert.deepEqual(navigateReferenceHistory(history, material, bow), [bow]);
assert.deepEqual(navigateReferenceHistory(history, material, material), history);
assert.deepEqual(navigateReferenceHistory(history, null, dungeon), [dungeon]);

// Selecting another row locally must become the origin of the next link.
assert.deepEqual(navigateReferenceHistory([bow], material, dungeon), [material, dungeon]);
for (let index = 0; index < 40; index += 1) {
  history = navigateReferenceHistory(history, history.at(-1), { category: "items", id: String(index) });
}
assert.equal(history.length, 32);
assert.equal(history.at(-1).id, "39");
console.log("Reference navigation history tests passed.");
