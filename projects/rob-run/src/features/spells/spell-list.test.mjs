import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGameDictionary } from "../../i18n/game-dictionary.ts";
import { getSpellFamilyKey, getSpellLearnLevel, getVisibleSpellRows } from "./spell-list.ts";

const rows = [
  [10, "Battle Shout", "Rank 1", 1, 1, 0, 0],
  [11, "Battle Shout", "Rank 2", 1, 1, 0, 0],
  [12, "Charge", "", 1, 1, 1, 0],
  [13, "Unconfirmed rune", "", 1, 1, 0, 0],
  [14, "Arcane Intellect", "", 1, 8, 0, 0],
  [15, "Talent", "Rank 1", 1, 1, 0, 0],
  [16, "Other effect", "", 1, 0, 0, 0],
];
const trainer = (level) => ({ source: "trainer", ranks: [{ id: 12, level }] });
const owners = new Map([
  [10, { source: "trainer", ranks: [{ id: 10, level: 1 }, { id: 11, level: 12 }] }],
  [11, { source: "trainer", ranks: [{ id: 10, level: 1 }, { id: 11, level: 12 }] }],
  [12, trainer(4)],
  [13, { source: "sod", ranks: [{ id: 13, level: 1 }] }],
  [14, { source: "trainer", ranks: [{ id: 14, level: 1 }] }],
  [15, { talentTree: "Arms", talentLevel: 10, ranks: [] }],
]);
const visible = (overrides = {}) => getVisibleSpellRows(rows, {
  mode: "player", classId: 1, query: "", sortOrder: "level-asc", owners, ...overrides,
}).map((row) => row[0]);

test("learning order shows each spell once at its first matching unlock", () => {
  assert.deepEqual(visible(), [10, 12, 15, 13]);
  assert.equal(getSpellLearnLevel(11, owners), 12);
  assert.equal(getSpellLearnLevel(15, owners), 10);
});

test("descending levels keep unknown and unconfirmed rune levels last", () => {
  assert.deepEqual(visible({ sortOrder: "level-desc" }), [11, 15, 12, 13]);
  assert.equal(getSpellLearnLevel(13, owners), undefined);
  assert.equal(getSpellLearnLevel(16, owners), undefined);
  for (const level of [0, -1, NaN, 1.5, undefined]) {
    assert.equal(getSpellLearnLevel(12, new Map([[12, trainer(level)]])), undefined);
  }
});

test("all sort orders keep a compact list and rank searches find the matching rank", () => {
  assert.deepEqual(visible({ sortOrder: "name" }), [10, 12, 15, 13]);
  assert.deepEqual(visible({ query: "11", sortOrder: "name" }), [11]);
  assert.deepEqual(visible({ query: "Battle Shout" }), [10]);
  assert.deepEqual(visible({ query: "rank 2" }), [11]);
});

test("an exact ID selects that rank when other ranks also match its digits", () => {
  const records = [...rows, [110, "Battle Shout", "Rank 3", 1, 1, 0, 0]];
  const metadata = new Map([...owners, [110, { source: "trainer", ranks: [{ id: 110, level: 1 }] }]]);
  for (const sortOrder of ["name", "level-asc", "level-desc"]) {
    assert.deepEqual(getVisibleSpellRows(records, { mode: "player", classId: 1, query: "11", sortOrder, owners: metadata }).map((row) => row[0]), [11]);
  }
});

test("localized spell names drive search and sorting while English and IDs remain searchable", () => {
  const displayName = (row) => ({ "Battle Shout": "Kampfschrei", Charge: "Ansturm" })[row[1]] ?? row[1];
  assert.deepEqual(visible({ query: "Ansturm", displayName }), [12]);
  assert.deepEqual(visible({ query: "Charge", displayName }), [12]);
  assert.deepEqual(visible({ query: "11", sortOrder: "name", displayName }), [11]);
  assert.deepEqual(visible({ sortOrder: "name", displayName }), [12, 10, 15, 13]);
});

test("class, record type, and new-spell filters work with level sorting", () => {
  assert.deepEqual(visible({ classId: 8 }), [14]);
  assert.deepEqual(visible({ mode: "new", classId: 0 }), [12]);
  assert.ok(visible({ mode: "all", classId: 0 }).includes(16));
  assert.ok(!visible({ classId: 0 }).includes(16));
});

test("level sorting wins over exact name relevance and name breaks equal-level ties", () => {
  const matches = [rows[0], [20, "Battle Shout Improved", "", 1, 1, 0, 0]];
  const metadata = new Map([...owners, [20, { source: "trainer", ranks: [{ id: 20, level: 20 }] }]]);
  const options = { mode: "player", classId: 1, query: "Battle Shout", sortOrder: "level-desc", owners: metadata };
  assert.deepEqual(getVisibleSpellRows(matches, options).map((row) => row[0]), [20, 10]);
  assert.deepEqual(visible({ classId: 0 }).slice(0, 2), [14, 10]);
});

test("missing metadata remains usable and sorting does not mutate the shared index", () => {
  const snapshot = structuredClone(rows);
  assert.equal(visible({ owners: null }).length, 4);
  visible({ sortOrder: "level-desc" });
  assert.deepEqual(rows, snapshot);
});

test("level range includes both endpoints and supports either bound on its own", () => {
  assert.deepEqual(visible({ minLevel: 4, maxLevel: 10 }), [12, 15]);
  assert.deepEqual(visible({ minLevel: 10 }), [15, 11]);
  assert.deepEqual(visible({ maxLevel: 4 }), [10, 12]);
  assert.deepEqual(visible({ minLevel: 12, maxLevel: 12 }), [11]);
  assert.deepEqual(visible({ minLevel: 12, maxLevel: 4 }), []);
  assert.deepEqual(visible({ minLevel: 1, owners: null }), []);
});

test("level ranges group matching ranks and compose with search and class", () => {
  assert.deepEqual(visible({ minLevel: 1, maxLevel: 12, sortOrder: "name", query: "Battle Shout" }), [10]);
  assert.deepEqual(visible({ minLevel: 2, query: "Battle Shout" }), [11]);
  assert.deepEqual(visible({ maxLevel: 1, classId: 8 }), [14]);
  assert.deepEqual(visible({ minLevel: 4, maxLevel: 12, sortOrder: "level-desc" }), [11, 15, 12]);
});

test("catalog Battle Shout has one row while level filters can still find its level 60 rank", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const [index, classes] = await Promise.all([
    readJson("../../../public/data/spells/foreverdb/index.json"),
    readJson("../../../public/data/spells/foreverdb/classes.json"),
  ]);
  const ability = classes.find((entry) => entry.id === 1).abilities.find((entry) => entry.n === "Battle Shout");
  const ranks = ability.ranks.map((rank) => ({ id: rank.id, level: rank.lv }));
  const metadata = new Map(ranks.map((rank) => [rank.id, { source: ability.src, ranks }]));
  const result = getVisibleSpellRows(index, { mode: "player", classId: 1, query: "Battle Shout", sortOrder: "level-asc", owners: metadata });
  const levels = result.map((row) => getSpellLearnLevel(row[0], metadata)).filter((level) => level !== undefined);
  assert.deepEqual(levels, [1]);
  const lastRank = getVisibleSpellRows(index, { mode: "player", classId: 1, query: "Battle Shout", sortOrder: "level-asc", owners: metadata, minLevel: 60 });
  assert.deepEqual(lastRank.map((row) => getSpellLearnLevel(row[0], metadata)), [60]);
  assert.equal(ranks.length, 7);
});

test("Savage Rend is one player row in every sort order, including level ranges", async () => {
  const index = JSON.parse(await readFile(new URL("../../../public/data/spells/foreverdb/index.json", import.meta.url), "utf8"));
  const savageRend = index.filter((row) => row[1] === "Savage Rend" && row[4] === 3);
  const ranks = savageRend.map((row) => ({ id: row[0], level: 1 }));
  const metadata = new Map(ranks.map((rank) => [rank.id, { source: "trainer", ranks }]));
  for (const sortOrder of ["name", "level-asc", "level-desc"]) {
    for (const minLevel of [undefined, 1]) {
      const result = getVisibleSpellRows(index, { mode: "player", classId: 3, query: "Savage Rend", sortOrder, owners: metadata, minLevel });
      assert.equal(result.length, 1);
      assert.equal(savageRend.length, 5);
      assert.ok(savageRend.every((rank) => getSpellFamilyKey(rank) === getSpellFamilyKey(result[0])));
    }
  }
});

test("all-record and new-spell lists group ranks without merging classes or unrelated effects", () => {
  const records = [
    ...rows,
    [20, "Battle Shout", "Rank 1", 1, 8, 1, 0],
    [21, "Pet attack", "Rank 1", 2, 0, 1, 0],
    [22, "Pet attack", "Rank 2", 2, 0, 1, 0],
    [23, "Pet attack", "Rank 1", 3, 0, 1, 0],
    [24, "Other effect", "", 1, 0, 0, 0],
  ];
  for (const mode of ["all", "new"]) {
    const result = getVisibleSpellRows(records, { mode, classId: 0, query: "", sortOrder: "name", owners });
    assert.equal(result.filter((row) => row[1] === "Pet attack").length, 2);
    assert.ok(result.some((row) => row[0] === 20));
    if (mode === "all") {
      assert.equal(result.filter((row) => row[1] === "Battle Shout").length, 2);
      assert.equal(result.filter((row) => row[1] === "Other effect").length, 2);
    }
  }
});

test("client spell names search the actual spell catalog in German", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const [index, source, german] = await Promise.all([
    readJson("../../../public/data/spells/foreverdb/index.json"),
    readJson("../../../public/data/locales/wow-forever/source.json"),
    readJson("../../../public/data/locales/wow-forever/deDE.json"),
  ]);
  const dictionary = createGameDictionary(source, german);
  const options = { mode: "player", classId: 1, sortOrder: "name", owners: null,
    displayName: (row) => dictionary.byKey.get(`SpellName:${row[0]}:0`) ?? row[1] };
  const localized = getVisibleSpellRows(index, { ...options, query: "Schlachtruf" });
  const english = getVisibleSpellRows(index, { ...options, query: "Battle Shout" });
  assert.equal(localized[0]?.[1], "Battle Shout");
  assert.deepEqual(localized.map((row) => row[0]), english.map((row) => row[0]));
});
