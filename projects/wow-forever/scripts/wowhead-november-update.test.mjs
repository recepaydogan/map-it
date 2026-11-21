import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const evidence = "data/site-research/wowhead-audit-2026-11-02";
const source = new Map((await readFile(`${evidence}/world-map.js`, "utf8")).trim().split(/\r?\n/).map((line) => {
  const match = /^WH\.setPageData\("wow\.worldMap\.classicplus\.([^\"]+)",(.*)\);$/.exec(line);
  return [match[1], JSON.parse(match[2])];
}));

test("map refresh retains all current gathering points and excludes hidden source categories", async () => {
  const herbOre = (await json("public/maps/world-atlas/locations-forever-all-gatherables.json")).locations;
  const other = (await json("public/maps/world-atlas/locations-forever-all-new-gathering.json")).locations;
  assert.equal(herbOre.length + other.length, source.get("nodes").reduce((n, row) => n + row.points.length, 0));
  const keys = new Set(source.get("categories").map((c) => c.key));
  for (const p of [...herbOre, ...other]) assert.ok(keys.has(p.subtype), p.subtype);
  const search = (await json("public/data/map-search/index.json")).locations;
  const indexed = new Map(search.map((row) => [row.point.id, row.point]));
  for (const p of [...herbOre, ...other]) {
    assert.equal(indexed.get(p.id)?.x, p.x, p.id);
    assert.equal(indexed.get(p.id)?.y, p.y, p.id);
  }
});

test("every registered map layer has unique valid IDs and inventory map links resolve", async () => {
  const registry = await readFile("src/features/map/map-registry.ts", "utf8");
  const files = [...registry.match(/locationFiles:\s*\[([^\]]+)\]/)[1].matchAll(/"([^\"]+)"/g)].map((m) => m[1]);
  const points = (await Promise.all(files.map((f) => json(`public/maps/world-atlas/${f}`)))).flatMap((c) => c.locations);
  const ids = new Set();
  for (const p of points) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.ok(Number.isFinite(p.x) && p.x >= 0 && p.x <= 32768, p.id);
    assert.ok(Number.isFinite(p.y) && p.y >= 0 && p.y <= 21845, p.id);
  }
  const vendors = await json("public/data/vendors/inventories.json");
  assert.equal(vendors.markers["mapgenie-innkeeper-950453"], "6928");
  assert.equal(vendors.vendors["6928"].length, 15);
  for (const [marker, npc] of Object.entries(vendors.markers)) {
    assert.ok(ids.has(marker), marker);
    assert.ok(vendors.vendors[npc], npc);
  }
  const sources = (await json("public/data/items/research/sources/54.json"))["118"];
  assert.ok(sources.some((s) => s.npc === 5808 && s.markerId === "forever-all-rare-5808-1"));
  for (const row of sources.filter((s) => s.markerId)) assert.ok(ids.has(row.markerId), row.markerId);
});

test("all 27 trees preserve unaffected source records and have real icons/spell pages", async () => {
  const catalog = await json("public/data/classes/talent-calculator.json");
  const remote = await json(`${evidence}/talents-classic.json`);
  const byId = new Map(Object.values(remote.talents).flatMap((tree) => Object.values(tree)).map((t) => [t.id, t]));
  const shards = await Promise.all(Array.from({ length: 64 }, (_, i) => json(`public/data/spells/foreverdb/${i}.json`)));
  const local = catalog.classes.flatMap((cls) => cls.trees.flatMap((tree) => tree.talents));
  const launch = catalog.sourceSnapshot === "wowhead-2026-11-04"
    ? await json("data/site-research/wowhead-check-2026-11-04/applied-update.json") : null;
  const changedIds = new Set(launch?.changedTalentIds ?? []);
  assert.equal(catalog.classes.flatMap((c) => c.trees).length, 27);
  assert.equal(local.length, byId.size + (launch?.addedTalentIds.length ?? 0) - (launch?.removedTalentIds.length ?? 0));
  for (const talent of local) {
    const current = byId.get(talent.id);
    if (!changedIds.has(talent.id)) {
      assert.equal(talent.n, current.name);
      assert.equal(talent.row, current.row);
      assert.equal(talent.col, current.col);
      assert.deepEqual(talent.ranks, current.ranks);
      assert.deepEqual(talent.pre, current.requires.map((r) => [r.id, r.qty - 1]));
    }
    await access(`public/data/spells/icons/${talent.ic}.webp`);
    for (const spellId of talent.ranks) assert.ok(shards[spellId % 64][String(spellId)], String(spellId));
  }
});

test("recommended builds use current names/ranks and satisfy all tier/prerequisite/level requirements", async () => {
  const catalog = await json("public/data/classes/talent-calculator.json");
  for (const cls of catalog.classes) {
    const builds = await json(`public/data/classes/guides/${cls.n.toLowerCase()}-builds.json`);
    const byId = new Map(cls.trees.flatMap((t) => t.talents).map((t) => [String(t.id), t]));
    for (const spec of Object.values(builds.specs)) for (const build of spec.builds) {
      assert.equal(Object.values(build.points).reduce((a, b) => a + b, 0), Math.min(build.level - 9, 51), build.id);
      for (const [id, count] of Object.entries(build.points)) {
        const talent = byId.get(id);
        assert.ok(talent, `${build.id}: ${id}`);
        assert.ok(count > 0 && count <= talent.ranks.length, `${build.id}: ${talent.n}`);
        const tree = cls.trees.find((t) => t.talents.includes(talent));
        const lower = tree.talents.filter((t) => t.row < talent.row).reduce((n, t) => n + (build.points[t.id] ?? 0), 0);
        assert.ok(lower >= talent.row * 5, `${build.id}: ${talent.n} tier`);
        for (const [required, rank] of talent.pre) assert.ok((build.points[required] ?? 0) >= rank + 1, `${build.id}: ${talent.n} prerequisite`);
        assert.equal(build.why[id], talent.d[count - 1]);
      }
    }
  }
});

test("complete tables agree with source and missing loot remains unknown", async () => {
  const remote = await json(`${evidence}/panels/source-tables.json`);
  const retry = await json(`${evidence}/panels/retry/source-tables.json`);
  for (const [id, tables] of Object.entries(retry)) remote[id] = { ...remote[id], ...tables };
  const post = await json(`${evidence}/post-publication/pages/source-tables.json`);
  for (const [id, tables] of Object.entries(post)) remote[id] = { ...remote[id], ...tables };
  const rare = await json("public/data/rares/details.json");
  for (const entry of rare.entries) if (remote[entry.id]?.drops) {
    assert.deepEqual(entry.drops.map((d) => Number(d.id)).sort((a, b) => a - b), remote[entry.id].drops.map((d) => d.id).sort((a, b) => a - b));
  }
  const reginald = rare.entries.find((r) => r.id === 256410);
  assert.equal(reginald.partial, true);
  assert.equal(reginald.drops, undefined);
  const quests = (await json("public/data/quests/quest-details.json")).quests;
  assert.equal(quests[93429].partial, undefined);
  assert.match(quests[93429].objective, /10 Lost Ones/);
  assert.deepEqual(quests[93429].rewardItems, []);
  assert.equal(quests[93429].faction, "Alliance");
  assert.equal(quests[93429].minimumLevel, 30);
  assert.equal(quests[93429].experience, 2750);
  assert.equal(quests[93429].money, "18s");
  assert.deepEqual(quests[1486].rewardChoices, []);
  assert.deepEqual(quests[1486].rewardItems.map((r) => r.id).sort(), ["6480", "918"]);
});

test("item overrides and confirmed racial durations agree with visible values", async () => {
  const items = (await json("public/data/items/catalog.json")).items;
  const enrichment = (await json("public/data/items/foreverdb-enrichment.json")).entries;
  assert.equal(items.find((i) => i.id === "269716").itemLevel, 18);
  assert.equal(enrichment[269716].current.stats.find((s) => s.key === "fd-dps").value, "6.0");
  assert.match(enrichment[3383].current.siteEffects[0].text, /3 for 30 min/);
  const races = (await json("public/data/races/catalog.json")).races;
  assert.match(races.find((r) => r.id === "troll").racials.find((r) => r.name === "Berserking").effect, /15 sec/);
  assert.ok(races.find((r) => r.id === "skyborne").racials.find((r) => r.name === "Skysight").sourceConflict);
});
