import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("character-snapshot.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { readCharacterSnapshotValue } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const now = Date.UTC(2026, 10, 5, 1), seconds = now / 1000;
const quest = { id: 456, title: "The Balance of Nature", level: 2,
  objectives: { 1: { text: "3/7 Young Nightsaber slain", have: 3, need: 7, done: false } } };
const character = (guid, quests) => ({ guid, name: "Test Hunter", realm: "Test realm", region: 3,
  classId: 3, raceId: 4, faction: "Alliance", level: 1, updatedAt: seconds,
  ...(quests === undefined ? {} : { quests: { capturedAt: seconds, active: quests } }) });
// The Lua live publisher emits all table keys as JSON object keys, including sequences.
const liveValue = value => value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [Array.isArray(value) ? Number(key) + 1 : key, liveValue(item)])) : value;
const read = characters => readCharacterSnapshotValue(liveValue({ schemaVersion: 1, current: "Player-1-A", characters }), now);

test("imports only explicit completed quest IDs, independently of active objectives", () => {
  const source = { ...character("Player-1-A", { 456: { ...quest, ready: true } }),
    completedQuests: { capturedAt: seconds, ids: { 6: true, 7: false, 8: 1, 9: "true", invalid: true, 0: true } } };
  const parsed = read({ "Player-1-A": source }).characters[0];
  assert.deepEqual(parsed.completedQuests, { capturedAt: seconds, ids: ["6"] });
  assert.equal(parsed.quests.active[0].ready, true);
});

test("missing or malformed completed snapshots stay unknown; a valid empty set stays empty", () => {
  for (const value of [undefined, { ids: { 6: true } }, { capturedAt: seconds + 1000, ids: { 6: true } },
    { capturedAt: seconds, ids: "6" }]) {
    assert.equal(read({ "Player-1-A": { ...character("Player-1-A"), completedQuests: value } }).characters[0].completedQuests, null);
  }
  assert.deepEqual(read({ "Player-1-A": { ...character("Player-1-A"), completedQuests: { capturedAt: seconds, ids: {} } } })
    .characters[0].completedQuests, { capturedAt: seconds, ids: [] });
});

test("imports observed quest IDs, objectives and explicit counts without inventing completion", () => {
  const result = read({ "Player-1-A": character("Player-1-A", { 456: quest }) });
  assert.equal(result.currentId, "addon:3:Player-1-A");
  const log = result.characters[0].quests;
  assert.equal(log.capturedAt, seconds);
  assert.equal(log.active[0].id, "456");
  assert.equal(log.active[0].ready, null);
  assert.deepEqual(log.active[0].objectives[0], { text: "3/7 Young Nightsaber slain", type: "", have: 3, need: 7, done: false });
});

test("keeps quest logs isolated between characters and accepts a confirmed empty log", () => {
  const result = read({ "Player-1-A": character("Player-1-A", { 456: quest }), "Player-1-B": character("Player-1-B", {}) });
  assert.equal(result.characters[0].quests.active.length, 1);
  assert.deepEqual(result.characters[1].quests.active, []);
});

test("older snapshots and classic objectives keep unavailable progress unknown", () => {
  assert.equal(read({ "Player-1-A": character("Player-1-A") }).characters[0].quests, null);
  const classic = { ...quest, objectives: { 1: { text: "Collect the sigil", done: true } } };
  const objective = read({ "Player-1-A": character("Player-1-A", { 456: classic }) }).characters[0].quests.active[0].objectives[0];
  assert.equal(objective.have, null);
  assert.equal(objective.need, null);
  assert.equal(objective.done, true);
});

test("rejects mismatched quest identities and invalid counts while preserving the character", () => {
  const invalid = { ...quest, id: 457 };
  const negative = { ...quest, objectives: { 1: { text: "Target", have: -1, need: "7" } } };
  const result = read({ "Player-1-A": character("Player-1-A", { 456: invalid, 457: { ...negative, id: 457 } }) });
  assert.equal(result.characters.length, 1);
  assert.deepEqual(result.characters[0].quests.active.map(q => q.id), ["457"]);
  assert.equal(result.characters[0].quests.active[0].objectives[0].have, null);
  assert.equal(result.characters[0].quests.active[0].objectives[0].need, null);
});

test("imports primary and secondary professions from both new and legacy addon records", () => {
  const entries = [
    [171, "alchemy", "primary"], [164, "blacksmithing", "primary"],
    [333, "enchanting", "primary"], [202, "engineering", "primary"],
    [182, "herbalism", "primary"], [165, "leatherworking", "primary"],
    [186, "mining", "primary"], [393, "skinning", "primary"],
    [197, "tailoring", "primary"], [185, "cooking", "secondary"],
    [129, "firstaid", "secondary"], [356, "fishing", "secondary"],
  ];
  for (const withType of [true, false]) {
    const data = { ...character("Player-1-A"), professions: { entries: entries.map(([skillLineId, , type]) =>
      ({ skillLineId, skill: 25, maxSkill: 75, ...(withType ? { type } : {}) })) } };
    assert.deepEqual(read({ "Player-1-A": data }).characters[0].professions.map(p => [p.id, p.type]),
      entries.map(([, id, type]) => [id, type]));
  }
});

test("classifies localized Classic skills and recipe-only snapshots without importing non-profession skills", () => {
  const classic = { ...character("Player-1-A"), skills: { entries: [
    { name: "Alchimie", skill: 25 }, { name: "烹饪", skill: 50 }, { name: "Swords", skill: 30 },
  ] } };
  assert.deepEqual(read({ "Player-1-A": classic }).characters[0].professions.map(p => [p.id, p.type]),
    [["alchemy", "primary"], ["cooking", "secondary"]]);
  const recipeOnly = { ...character("Player-1-A"), recipes: { 1: { skillLineId: 129, capturedAt: seconds, learned: {} } } };
  assert.equal(read({ "Player-1-A": recipeOnly }).characters[0].professions[0].type, "secondary");
});

test("recipe merging and malformed addon types cannot misclassify a known profession", () => {
  const data = { ...character("Player-1-A"), professions: { entries: [
    { skillLineId: 171, type: "secondary" }, { skillLineId: 185, type: "invalid" },
  ] }, recipes: { 1: { skillLineId: 171, capturedAt: seconds, learned: { 123: true } } } };
  const professions = read({ "Player-1-A": data }).characters[0].professions;
  assert.deepEqual(professions.map(p => [p.id, p.type]), [["alchemy", "primary"], ["cooking", "secondary"]]);
  assert.deepEqual(professions[0].learned, ["123"]);
});
