import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("./quest-completion.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node" });
const { indexQuestCompletion, isCompletedOnceQuest } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const character = { completedQuests: { capturedAt: 1000, ids: ["6", "7", "8", "9"] }, quests: { active: [] } };
const points = [
  { id: "normal", category: "quest", questId: "6" },
  { id: "repeat", category: "repeatable-quest", questId: "7" },
  { id: "giver", category: "npc", questOffers: [{ id: "8", kind: "dungeon" }, { id: "10" }] },
];

test("only recorded non-repeatable quests get the tag; unknown and ready-to-turn-in quests do not", () => {
  const index = indexQuestCompletion(points, {});
  assert.equal(isCompletedOnceQuest(character, "6", index), true);
  assert.equal(isCompletedOnceQuest(character, "8", index), true);
  for (const id of ["7", "9", "10", undefined]) assert.equal(isCompletedOnceQuest(character, id, index), false);
  assert.equal(isCompletedOnceQuest(character, "6", undefined), false);
  assert.equal(isCompletedOnceQuest({ ...character, quests: { active: [{ id: "6", ready: true }] } }, "6", index), false);
});

test("repeatable evidence wins regardless of ordering and legacy markers resolve by ID", () => {
  const conflicting = [...points, { id: "normal-repeat", category: "quest", questId: "7" },
    { id: "legacy", category: "quest" }, { id: "legacy-repeat", category: "repeatable-quest" }];
  for (const entries of [conflicting, [...conflicting].reverse()]) {
    const index = indexQuestCompletion(entries, { legacy: "9", "legacy-repeat": "8" });
    assert.equal(isCompletedOnceQuest(character, "7", index), false);
    assert.equal(isCompletedOnceQuest(character, "8", index), false);
    assert.equal(isCompletedOnceQuest(character, index.markerQuestIds.legacy, index), true);
  }
});

test("completion remains scoped to the selected character, including manual/unknown profiles", () => {
  const index = indexQuestCompletion(points, {});
  assert.equal(isCompletedOnceQuest(character, "6", index), true);
  for (const selected of [undefined, {}, { completedQuests: null }, { completedQuests: { ids: ["8"] } }]) {
    assert.equal(isCompletedOnceQuest(selected, "6", index), false);
  }
});

test("published catalog classifications exclude the weekly quest and all repeatable offers", async () => {
  const data = JSON.parse(await readFile(new URL("../../../public/data/map-search/index.json", import.meta.url), "utf8"));
  const quests = JSON.parse(await readFile(new URL("../../../public/data/quests/quest-details.json", import.meta.url), "utf8"));
  const index = indexQuestCompletion(data.locations.map(location => location.point), quests.markerQuestIds);
  assert.equal(index.repeatable.get("6"), false);
  assert.equal(index.repeatable.get("96076"), true);
  const repeatable = data.locations.flatMap(location => location.point.questOffers ?? []).filter(offer => offer.kind === "repeatable");
  assert.ok(repeatable.length > 100);
  for (const quest of repeatable) assert.equal(isCompletedOnceQuest({ completedQuests: { ids: [quest.id] } }, quest.id, index), false);
});
