import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const bundle = await build({
  entryPoints: [path.join(root, "src/features/reference/quest-location-targets.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/", VITE_CONTENT_BASE_URL: "https://example.invalid" }) },
});
const { findQuestLocationName, questLocationTargets, questDungeonTargets,
  questObjectiveReferenceLinks, questSourceMapTargets, questLinkedDungeonIds } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);
const presentationBundle = await build({
  entryPoints: [path.join(root, "src/features/reference/quest-presentation.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { isInactiveQuestObjectiveText, questObjectiveText } = await import(
  `data:text/javascript;base64,${Buffer.from(presentationBundle.outputFiles[0].contents).toString("base64")}`
);
const english = await json("src/i18n/locales/en.json");
const translate = (key, options = {}) => {
  const value = key.split(".").reduce((node, part) => node?.[part], english) ?? key;
  return typeof value === "string" ? value.replaceAll("{{name}}", options.name ?? "") : key;
};
const quest = async (chunk, id) => (await json(`public/data/reference/quests/${chunk}.json`)).entries[id];
const dungeon = async (chunk, id) => (await json(`public/data/reference/dungeons/${chunk}.json`)).entries[id];
const markers = async (mapId) => (await json(`public/maps/${mapId}/metadata.json`)).locations
  .filter((point) => point.reference?.id)
  .map((point) => ({ name: point.name, mapId, markerId: point.id, referenceId: point.reference.id }));
const objective = (entry, step, kind) => entry.sections
  .find((section) => section.title === "reference.labels.objectives").rows
  .find((row) => row.name === `${step} · ${kind}`);
const targetFor = (entry, row, candidates, phrase, dungeonTargets = []) => questLocationTargets(entry, row.links ?? [], [],
  { step: Number(row.name.split(" · ")[0]), text: row.description }, candidates, dungeonTargets)
  .find((target) => findQuestLocationName(row.description, target.name) >= 0
    && target.name.toLowerCase() === phrase.toLowerCase());

test("every dungeon reference uses the chunk address loaded by the quest panel", async () => {
  const names = (await readdir(path.join(root, "public/data/reference/dungeons")))
    .filter((name) => name.endsWith(".json"));
  for (const name of names) {
    const data = await json(`public/data/reference/dungeons/${name}`);
    for (const id of Object.keys(data.entries)) {
      assert.equal(createHash("sha256").update(id).digest("hex").slice(0, 2), name.slice(0, 2), id);
    }
  }
});

test("Crash Site cave objectives open the published quest dungeon door", async () => {
  const entry = await quest("a5", "Quest:2202017");
  const map = await json("public/maps/world-d-a/metadata.json");
  const door = map.locations.find((point) => point.id === "world-d-a-instance-entrance-d407a572043aac91");
  const dungeon = (await json("public/data/reference/dungeons/6c.json")).entries["Dungeon:850006"];
  assert.equal(door?.category, "instance-entrance");
  assert.equal(door?.reference?.id, "EnvObjData:1300660");
  assert.equal(dungeon.locations[0]?.markerId, door.id);
  for (const [step, kind, phrase] of [
    [4, "Enter Volume PC", "cave near the Crash Site"],
    [6, "Enter Volume PC", "inside the cave"],
  ]) {
    const row = objective(entry, step, kind);
    assert.ok(row);
    const target = targetFor(entry, row, await markers("world-d-a"), phrase);
    assert.equal(target?.mapId, "world-d-a");
    assert.equal(target?.markerId, door.id);
  }
});

test("a Selvis call and unlocated note do not acquire invented map links", async () => {
  const prison = await quest("98", "Quest:2101080");
  const call = objective(prison, 4, "Complete Celvice Talk");
  assert.equal(call.description, "Talk via Selvis");
  assert.equal(call.links.length, 0);
  assert.equal(targetFor(prison, call, await markers("world-d-starter"), "Selvis"), undefined);
  const fang = await quest("a5", "Quest:2202017");
  const note = objective(fang, 2, "Close Note");
  assert.equal(note.description, "Read the Fang Command");
  assert.equal(targetFor(fang, note, await markers("world-d-a"), "Fang Command"), undefined);
});

test("Lost Supplies links Robin at its Daminu Forest entrance and leaves Selvis unlocated", async () => {
  const entry = await quest("32", "Quest:1101012");
  const call = objective(entry, 1, "Complete Celvice Talk");
  const conversation = objective(entry, 2, "Clear Map Event");
  const linkedDungeon = await dungeon("78", "Dungeon:96");
  const map = await json("public/maps/world-l-starter/metadata.json");
  const marker = map.locations.find((point) => point.id === linkedDungeon.locations[0]?.markerId);
  const candidates = await markers("world-l-starter");
  assert.equal(call.description, "Talk via Selvis");
  assert.equal(targetFor(entry, call, candidates, "Selvis"), undefined);
  assert.equal(conversation.description, "Talk to Robin");
  assert.deepEqual(conversation.links, []);
  assert.equal(linkedDungeon.name, "Daminu Forest");
  assert.equal(marker?.category, "instance-entrance");
  assert.equal(marker?.reference?.id, "NpcData:2930710");
  assert.equal(targetFor(entry, conversation, candidates, "Robin",
    questDungeonTargets(entry, [linkedDungeon]))?.markerId, marker.id);
  assert.notEqual(marker.id, map.locations.find((point) => point.reference?.id === "NpcData:2931032")?.id);
});

test("Go to Daminu opens his native Poeta spawn next to the quest trigger", async () => {
  const entry = await quest(createHash("sha256").update("Quest:1101021").digest("hex").slice(0, 2),
    "Quest:1101021");
  const row = objective(entry, 2, "Enter Volume PC");
  const daminu = (await json("public/data/reference/creatures/ae.json")).entries["NpcData:2930711"];
  const map = await json("public/maps/world-l-starter/metadata.json");
  const marker = map.locations.find((point) => point.reference?.id === daminu.id);
  const target = targetFor(entry, row, await markers("world-l-starter"), "Daminu");
  assert.equal(row.description, "Go to Daminu");
  assert.equal(daminu.name, "Daminu");
  assert.deepEqual(row.links, [{ id: daminu.id, category: "creatures", name: daminu.name }]);
  assert.deepEqual(daminu.sections.find((section) => section.title === "reference.adventure.relatedQuests")?.links,
    [{ id: entry.id, category: "quests", name: entry.name }]);
  assert.equal(marker?.id, "world-l-starter-npc-9fb5a9d12dcefdb3");
  assert.equal(marker?.category, "quest-npc");
  assert.equal(marker?.sourceActor, "N_L0_Q_Daminu_01");
  assert.deepEqual(marker?.worldPosition, {
    X: -11490.2587890625, Y: -43798.16015625, Z: 18010.568359375,
  });
  assert.ok(Math.hypot(marker.worldPosition.X + 11950, marker.worldPosition.Y + 43900) < 500);
  assert.deepEqual(daminu.locations, entry.locations.filter((location) => location.markerId === marker.id));
  assert.equal(target?.markerId, marker.id);
  assert.equal(target?.mapId, "world-l-starter");
  assert.ok((await json("public/data/map-search/index.json")).locations
    .some((location) => location.point.id === marker.id && location.names.includes("Daminu")));
});

test("linked quest objectives open the referenced quest rather than a map marker", async () => {
  for (const [questId, linkedId] of [
    ["Quest:1101021", "Quest:1602000"],
    ["Quest:2101060", "Quest:2602000"],
  ]) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const row = objective(entry, 1, "Clear Quest");
    const references = questObjectiveReferenceLinks(row.description, row.links);
    assert.deepEqual(references.inline.map((link) => link.id), [linkedId]);
    assert.deepEqual(references.additional, []);
    assert.equal(findQuestLocationName(row.description, references.inline[0].name), 0);
  }
  const mismatchedId = "Quest:1102995";
  const entry = await quest(createHash("sha256").update(mismatchedId).digest("hex").slice(0, 2), mismatchedId);
  const row = objective(entry, 1, "Clear Quest");
  const references = questObjectiveReferenceLinks(row.description, row.links);
  assert.deepEqual(references.inline, []);
  assert.deepEqual(references.additional.map((link) => link.id), ["Quest:1602020"]);
  const names = (await readdir(path.join(root, "public/data/reference/quests")))
    .filter((name) => name.endsWith(".json"));
  const allQuests = (await Promise.all(names.map(async (name) =>
    Object.values((await json(`public/data/reference/quests/${name}`)).entries)))).flat();
  const publishedIds = new Set(allQuests.map((candidate) => candidate.id));
  let linkedRows = 0;
  for (const candidate of allQuests) {
    for (const section of candidate.sections.filter((item) => item.title === "reference.labels.objectives")) {
      for (const objectiveRow of section.rows ?? []) {
        const links = objectiveRow.links?.filter((link) => link.category === "quests") ?? [];
        if (!links.length) continue;
        linkedRows++;
        const text = questObjectiveText(objectiveRow, translate, (value) => value);
        const targets = questObjectiveReferenceLinks(text, links);
        assert.deepEqual(new Set([...targets.inline, ...targets.additional].map((link) => link.id)),
          new Set(links.map((link) => link.id)), candidate.id);
        assert.ok(links.every((link) => publishedIds.has(link.id)), candidate.id);
      }
    }
  }
  assert.equal(linkedRows, 12);
});

test("truncated quest instructions show their linked target names", async () => {
  const entry = await quest("7a", "Quest:2102080");
  const rows = entry.sections.find((section) => section.title === "reference.labels.objectives").rows
    .filter((row) => row.description === "Defeat …");
  assert.deepEqual(rows.map((row) => questObjectiveText(row, translate, (value) => value)),
    ["Defeat Lost Specter", "Defeat Ancient Revenant Knight"]);
  const mapMarkers = await markers("world-d-a");
  for (const row of rows) {
    const text = questObjectiveText(row, translate, (value) => value);
    const targets = questLocationTargets(entry, row.links, [], { step: 1, text }, mapMarkers);
    assert.ok(targets.some((target) => target.name === row.links[0].name
      && target.referenceId === row.links[0].id), text);
  }
  const chunks = (await readdir(path.join(root, "public/data/reference/quests")))
    .filter((name) => name.endsWith(".json"));
  const quests = (await Promise.all(chunks.map(async (name) =>
    Object.values((await json(`public/data/reference/quests/${name}`)).entries)))).flat();
  let truncated = 0;
  for (const candidate of quests) {
    for (const section of candidate.sections.filter((item) => item.title === "reference.labels.objectives")) {
      for (const row of section.rows ?? []) {
        if (!/\s*(?:…|\.{3})\s*$/u.test(row.description ?? "") || !row.links?.length) continue;
        truncated++;
        const text = questObjectiveText(row, translate, (value) => value);
        assert.ok(!/\s*(?:…|\.{3})\s*$/u.test(text), `${candidate.id}: ${text}`);
        for (const name of new Set(row.links.map((link) => link.name))) {
          assert.ok(text.includes(name), `${candidate.id}: ${text} should name ${name}`);
        }
      }
    }
  }
  assert.ok(truncated > 2);
});

test("past-tense Poeta narrative does not route to unrelated characters or travel points", async () => {
  const entry = await quest("05", "Quest:1101070");
  const descriptionTargets = questLocationTargets(entry, [], [], undefined,
    await markers("world-l-starter"));
  for (const name of ["Phernos", "Dawn Legion", "Balaur Brigade"]) {
    assert.equal(descriptionTargets.find((target) => target.name === name), undefined, name);
  }
  const row = objective(entry, 1, "Clear Map Event");
  assert.equal(targetFor(entry, row, await markers("world-l-starter"), "brigade base")?.markerId,
    "world-l-starter-quest-area-9c2ba3923263a8e0");
});

test("Table of Testament interaction opens its quest object at the shrine", async () => {
  const entry = await quest(createHash("sha256").update("Quest:1102980").digest("hex").slice(0, 2),
    "Quest:1102980");
  const row = objective(entry, 1, "Clear Map Event");
  const target = targetFor(entry, row, await markers("world-l-a"), "Table of Testament");
  const map = await json("public/maps/world-l-a/metadata.json");
  const point = map.locations.find((marker) => marker.id === target?.markerId);
  const entrance = map.locations.find((marker) => marker.name === "Table of Testament"
    && marker.category === "dungeon");
  assert.equal(point?.category, "quest-object");
  assert.equal(point?.reference?.id, "EnvObjData:1201305");
  assert.ok(Math.hypot(point.x - entrance.x, point.y - entrance.y) < 2);
});

test("Aulamus's key directs the Phernos conversation to its linked instance entrance", async () => {
  const entry = await quest("db", "Quest:1102350");
  const row = objective(entry, 3, "Clear Map Event");
  const linkedDungeon = await dungeon("55", "Dungeon:63");
  const map = await json("public/maps/world-l-a/metadata.json");
  const marker = map.locations.find((point) => point.id === linkedDungeon.locations[0]?.markerId);
  const target = targetFor(entry, row, await markers("world-l-a"), "Phernos",
    questDungeonTargets(entry, [linkedDungeon]));
  assert.equal(row.description, "Talk to Phernos");
  assert.deepEqual(row.links, []);
  assert.equal(linkedDungeon.name, "Place of Aulamus");
  assert.equal(marker?.category, "instance-entrance");
  assert.equal(marker?.reference?.id, "NpcData:2931266");
  assert.equal(target?.mapId, "world-l-a");
  assert.equal(target?.markerId, marker.id);
});

test("same-named objective objects retain separate source identities", async () => {
  const questId = "Quest:2202067";
  const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
  const row = objective(entry, 1, "Use Env Obj");
  const sources = questSourceMapTargets(row.links, await markers("world-d-a"));
  assert.deepEqual(new Set(sources.map((source) => source.referenceId)),
    new Set(["EnvObjData:1301141", "EnvObjData:1301142"]));
  assert.equal(sources.length, 2);
  assert.ok(sources.every((source) => source.search?.referenceId === source.referenceId));
});

test("the guard camp storage step opens its dungeon door", async () => {
  const entry = await quest("98", "Quest:2101080");
  const row = objective(entry, 6, "Clear Map Event");
  const target = targetFor(entry, row, await markers("world-d-starter"), "guard camp storage");
  const dungeon = (await json("public/data/reference/dungeons/c6.json")).entries["Dungeon:105"];
  assert.equal(target?.markerId, dungeon.locations[0]?.markerId);
  const map = await json("public/maps/world-d-starter/metadata.json");
  assert.equal(map.locations.find((point) => point.id === target.markerId)?.category, "instance-entrance");
});

test("a shortened talk objective keeps its linked NPC identity", async () => {
  const cases = [
    ["45", "Quest:1101011", 2, "Arisel", "NpcData:2931050"],
    ["24", "Quest:1101018", 1, "Ryan", "NpcData:2931047"],
    ["24", "Quest:1101018", 3, "Arno", "NpcData:2931095"],
  ];
  const candidates = await markers("world-l-starter");
  for (const [chunk, id, step, name, referenceId] of cases) {
    const entry = await quest(chunk, id);
    const row = objective(entry, step, "Ask Npc");
    const target = targetFor(entry, row, candidates, name);
    assert.equal(target?.referenceId, referenceId, `${id} step ${step}`);
    assert.ok(candidates.some((point) => point.markerId === target.markerId
      && point.referenceId === referenceId));
  }
});

test("a shortened defeat objective searches the exact linked creature", async () => {
  const entry = await quest("24", "Quest:1101018");
  const row = objective(entry, 2, "Kill Npc");
  const target = targetFor(entry, row, await markers("world-l-starter"), "Dratona");
  assert.equal(target?.referenceId, "NpcData:2101164");
  assert.equal(target?.search?.referenceId, "NpcData:2101164");
});

test("differently worded object steps keep their exact object markers", async () => {
  const supply = await quest("45", "Quest:1101011");
  const supplyRow = objective(supply, 3, "Use Env Obj");
  const supplyTarget = targetFor(supply, supplyRow, await markers("world-l-starter"), "Find useful gear");
  assert.equal(supplyTarget?.referenceId, "EnvObjData:1200530");
  assert.equal(supplyTarget?.markerId, "world-l-starter-quest-object-2168722f801a5ef1");

  const search = await quest("39", "Quest:1202043");
  for (const [phrase, referenceId] of [
    ["Inspect the first corpse", "EnvObjData:1201297"],
    ["Inspect the second corpse", "EnvObjData:1201296"],
  ]) {
    const row = search.sections.find((section) => section.title === "reference.labels.objectives").rows
      .find((item) => item.description === phrase);
    const target = targetFor(search, row, await markers("world-l-a"), phrase);
    assert.equal(target?.referenceId, referenceId);
  }
});

test("linked travel objects open their exact published portals", async () => {
  for (const [questId, step, mapId, referenceId, markerId] of [
    ["Quest:2103020", 1, "world-d-a", "EnvObjData:1100487", "world-d-a-portal-6a154653165f1d56"],
    ["Quest:1103020", 3, "world-l-a", "EnvObjData:1100489", "world-l-a-portal-4ea967761a3dead9"],
  ]) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const row = objective(entry, step, "Use Env Obj");
    const text = questObjectiveText(row, translate, (value) => value);
    const candidates = await markers(mapId);
    const target = questLocationTargets(entry, row.links, [], { step, text }, candidates)
      .find((candidate) => candidate.name === "Teleportation Portal");
    assert.equal(text, "Use Teleportation Portal");
    assert.equal(target?.referenceId, referenceId);
    assert.equal(target?.markerId, markerId);
    assert.equal((await json(`public/maps/${mapId}/metadata.json`)).locations
      .find((point) => point.id === markerId)?.category, "portal");
  }
});

test("a named quest instance uses its own dungeon entry's published door", async () => {
  const entry = await quest("39", "Quest:1202043");
  const office = await dungeon("36", "Dungeon:2");
  const house = await dungeon("f2", "Dungeon:800018");
  const targets = questDungeonTargets(entry, [office, house]);
  const map = await json("public/maps/world-l-a/metadata.json");
  for (const [step, kind, name, expected] of [
    [2, "Clear Map Event", "Caelid's Office", office.locations[0].markerId],
    [3, "Enter Volume PC", "Old Empty House", house.locations[0].markerId],
  ]) {
    const row = objective(entry, step, kind);
    const target = targetFor(entry, row, await markers("world-l-a"), name, targets);
    assert.equal(target?.markerId, expected);
    assert.equal(map.locations.find((point) => point.id === expected)?.category, "instance-entrance");
  }
});

test("the Nahid plant door opens an entrance rather than fast travel", async () => {
  const entry = await quest("73", "Quest:1102880");
  const row = objective(entry, 1, "Clear Map Event");
  const target = targetFor(entry, row, await markers("world-l-a"), "Nahid Disposal Plant");
  assert.equal(target?.markerId, "world-l-a-dungeon-5df6c92e3826f686");
  const map = await json("public/maps/world-l-a/metadata.json");
  assert.equal(map.locations.find((point) => point.id === target.markerId)?.category, "dungeon");
});

test("the preceding trip to Nahid Disposal Plant uses the same entrance", async () => {
  const entry = await quest("ea", "Quest:1102870");
  const row = objective(entry, 5, "Enter Volume PC");
  const target = targetFor(entry, row, await markers("world-l-a"), "Nahid Disposal Plant");
  assert.equal(target?.markerId, "world-l-a-dungeon-5df6c92e3826f686");
});

test("unlisted story entrances resolve to their named published doors", async () => {
  const cases = [
    ["0f", "Quest:1102280", 1, "Illicit Trade Spot", "world-l-a-dungeon-59cf12e1bf115c01"],
    ["2f", "Quest:1102320", 2, "Root Cellar", "world-l-a-dungeon-d6cd2e14c9518af0"],
    ["e0", "Quest:1102360", 1, "Aullaeu Altar", "world-l-a-dungeon-9354e45cd8612245"],
  ];
  const candidates = await markers("world-l-a");
  const map = await json("public/maps/world-l-a/metadata.json");
  for (const [chunk, id, step, name, markerId] of cases) {
    const entry = await quest(chunk, id);
    const row = objective(entry, step, "Clear Map Event");
    const target = targetFor(entry, row, candidates, name);
    assert.equal(target?.markerId, markerId);
    assert.equal(map.locations.find((point) => point.id === markerId)?.category, "dungeon");
  }
});

test("a sky-island objective does not open the nearby campsite travel point", async () => {
  const entry = await quest("2e", "Quest:1202014");
  const row = objective(entry, 9, "Enter Volume PC");
  const regions = [{ name: "Eastern Cantas Valley", mapId: "world-l-a",
    markerId: "region:WorldMap_Name_CantasValleyEastern" }];
  const targets = questLocationTargets(entry, row.links ?? [], regions,
    { step: 9, text: row.description }, await markers("world-l-a"));
  assert.equal(targets.some((target) => target.markerId === "world-l-a-teleport-be99bdc81996d81b"), false);
  assert.equal(targets.some((target) => target.markerId === "region:WorldMap_Name_CantasValleyEastern"), false);
});

test("a possessive NPC name does not link a collection objective to that NPC", async () => {
  const entry = await quest("c4", "Quest:1202057");
  const row = objective(entry, 6, "Kill Npc");
  assert.equal(row.description, "Recover Naru's supplies from the Kobold");
  assert.equal(targetFor(entry, row, await markers("world-l-a"), "Naru"), undefined);
  assert.equal(findQuestLocationName("Talk to Naru", "Naru"), 8);
  const drops = await quest("c4", "Quest:1202057");
  const dropRow = objective(drops, 1, "Kill Npc");
  assert.equal(targetFor(drops, dropRow, await markers("world-l-a"), "Gentle Meadow Zaif")?.referenceId,
    dropRow.links[0].id);
});

test("Sten resolves to the linked Sthen NPC marker", async () => {
  const entry = await quest("df", "Quest:1202066");
  const row = objective(entry, 1, "Ask Npc");
  assert.equal(row.links[0]?.name, "Sthen");
  const candidates = await markers("world-l-a");
  const target = targetFor(entry, row, candidates, "Sten");
  assert.equal(target?.markerId, "world-l-a-npc-eccf58f81301f75f");
  assert.equal(candidates.find((point) => point.markerId === target.markerId)?.referenceId,
    row.links[0].id);
});

test("each faction's Wanted objective opens its own recon-site boss pin", async () => {
  for (const [firstQuest, mapId] of [[1302010, "world-l-a"], [2302010, "world-d-a"]]) {
    const candidates = await markers(mapId);
    const map = await json(`public/maps/${mapId}/metadata.json`);
    for (let questNumber = firstQuest; questNumber <= firstQuest + 14; questNumber++) {
    const questId = `Quest:${questNumber}`;
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const row = objective(entry, 1, "Clear Map Event");
    const phrase = row.description.replace(/^Defeat /u, "");
    const target = targetFor(entry, row, candidates, phrase);
    const point = map.locations.find((marker) => marker.id === target?.markerId);
    const dungeonLink = entry.sections.find((section) => section.title === "reference.instanceLayer.questInstances")
      ?.links?.[0];
    const dungeonEntry = await dungeon(createHash("sha256").update(dungeonLink.id).digest("hex").slice(0, 2),
      dungeonLink.id);
    const bossIds = dungeonEntry.sections.find((section) => section.title === "reference.labels.bosses")
      ?.links?.map((link) => link.id) ?? [];
    assert.equal(point?.category, "dungeon-boss", questId);
    assert.ok(bossIds.includes(point.reference?.id), questId);
    }
  }
});

test("generic multi-enemy objectives expose each linked published source", async () => {
  const questId = "Quest:1302163";
  const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
  const row = objective(entry, 1, "Kill Npc");
  assert.equal(row.description, "Defeat Dratona");
  const sources = questSourceMapTargets(row.links, await markers("world-l-a"));
  assert.deepEqual(new Set(sources.map((source) => source.referenceId)),
    new Set(row.links.map((link) => link.id)));
  assert.ok(sources.every((source) => source.search?.referenceId === source.referenceId));
});

test("ended seasonal objectives do not offer stale source markers", async () => {
  const questId = "Quest:1302538";
  const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
  const row = objective(entry, 1, "Kill Npc");
  assert.ok(isInactiveQuestObjectiveText(row.description));
  assert.ok(questSourceMapTargets(row.links, await markers("world-l-a")).length > 0);
  assert.equal(isInactiveQuestObjectiveText("Defeat Dratona"), false);
});

test("swapped Abyss source rows navigate to the boss named by each objective", async () => {
  const candidates = await markers("reshanta-a");
  for (const questId of ["Quest:1309034", "Quest:1309074", "Quest:2309034", "Quest:2309074"]) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    for (const [phrase, referenceId, wrongReferenceId] of [
      ["Abyss Elite Drakan", "NpcData:2600074", "NpcData:2600075"],
      ["Abyss Superior Drakan", "NpcData:2600075", "NpcData:2600074"],
    ]) {
      const row = entry.sections.find((section) => section.title === "reference.labels.objectives").rows
        .find((item) => item.description === `Defeat ${phrase}`);
      assert.equal(row.links[0]?.id, wrongReferenceId);
      const target = targetFor(entry, row, candidates, phrase);
      assert.equal(target?.search?.referenceId, referenceId);
      assert.ok(candidates.some((point) => point.markerId === target.markerId
        && point.referenceId === referenceId));
      assert.equal(questSourceMapTargets(row.links, candidates, { questId, text: row.description }).length, 0);
    }
  }
});

test("unlocated exploration quests open the exact entrance in their linked dungeon records", async () => {
  for (const [first, last] of [[1803011, 1803030], [1810001, 1810061]]) {
    for (let questNumber = first; questNumber <= last; questNumber++) {
      const questId = `Quest:${questNumber}`;
      const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
      assert.equal(entry.locations.length, 0, questId);
      const row = objective(entry, 1, "Clear Map Event");
      const dungeonLink = row.links?.find((link) => link.category === "dungeons");
      assert.ok(dungeonLink, questId);
      assert.ok(questLinkedDungeonIds(entry).includes(dungeonLink.id), questId);
      const dungeonEntry = await dungeon(createHash("sha256").update(dungeonLink.id).digest("hex").slice(0, 2),
        dungeonLink.id);
      const targets = questDungeonTargets(entry, [dungeonEntry]);
      const text = questObjectiveText(row, translate, (value) => value);
      assert.equal(text, `Complete ${dungeonLink.name}`, questId);
      const target = targetFor(entry, { ...row, description: text }, [], dungeonEntry.name, targets);
      const map = await json(`public/maps/${dungeonEntry.locations[0].mapId}/metadata.json`);
      const point = map.locations.find((marker) => marker.id === target?.markerId);
      assert.equal(target?.markerId, dungeonEntry.locations[0].markerId, questId);
      assert.equal(point?.category, "dungeon", questId);
    }
  }
});

test("dungeon wording distinguishes an entrance from an altar object", async () => {
  for (const [questId, step, kind, dungeonId, phrase] of [
    ["Quest:2102550", 3, "Ask Npc", "Dungeon:45", "Abandoned Campsite"],
    ["Quest:2102140", 2, "Clear Map Event", "Dungeon:46", "Barracks Storage"],
  ]) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const dungeonEntry = await dungeon(createHash("sha256").update(dungeonId).digest("hex").slice(0, 2), dungeonId);
    const row = objective(entry, step, kind);
    const target = targetFor(entry, row, await markers(dungeonEntry.locations[0].mapId), phrase,
      questDungeonTargets(entry, [dungeonEntry]));
    assert.equal(target?.markerId, dungeonEntry.locations[0].markerId, questId);
  }
  const altarQuestId = "Quest:2102250";
  const altarQuest = await quest(createHash("sha256").update(altarQuestId).digest("hex").slice(0, 2), altarQuestId);
  const altarDungeonId = "Dungeon:111033";
  const altarDungeon = await dungeon(createHash("sha256").update(altarDungeonId).digest("hex").slice(0, 2),
    altarDungeonId);
  const row = objective(altarQuest, 2, "Clear Map Event");
  const target = targetFor(altarQuest, row, await markers("world-d-a"), "Earth Altar",
    questDungeonTargets(altarQuest, [altarDungeon]));
  assert.notEqual(target?.markerId, altarDungeon.locations[0].markerId);
});

test("linked dungeon door labels resolve differently worded objective destinations", async () => {
  for (const [questId, step, dungeonId, phrase] of [
    ["Quest:2101040", 5, "Dungeon:110007", "Veil Jewel"],
    ["Quest:2101100", 1, "Dungeon:110006", "village cabin"],
    ["Quest:2102690", 4, "Dungeon:111039", "Fafnite Storage"],
  ]) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const dungeonEntry = await dungeon(createHash("sha256").update(dungeonId).digest("hex").slice(0, 2), dungeonId);
    const row = objective(entry, step, "Clear Map Event");
    const target = targetFor(entry, row, [], phrase, questDungeonTargets(entry, [dungeonEntry]));
    assert.equal(target?.markerId, dungeonEntry.locations[0].markerId, questId);
    const map = await json(`public/maps/${target.mapId}/metadata.json`);
    assert.equal(map.locations.find((point) => point.id === target.markerId)?.category, "instance-entrance");
  }
});

test("a door label shared with an NPC does not hijack that NPC's link", async () => {
  const questId = "Quest:2101030";
  const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
  const dungeonEntry = await dungeon(createHash("sha256").update("Dungeon:103").digest("hex").slice(0, 2),
    "Dungeon:103");
  const row = objective(entry, 3, "Clear Map Event");
  const candidates = await markers("world-d-starter");
  const targets = questDungeonTargets(entry, [dungeonEntry]);
  assert.equal(targetFor(entry, row, candidates, "Munihelle Forest", targets)?.markerId,
    dungeonEntry.locations[0].markerId);
  assert.equal(targetFor(entry, row, candidates, "Maard", targets)?.markerId,
    "world-d-starter-npc-dea0ce08a33f452f");
});

test("unlinked Altgard story locations open their exact published entrances", async () => {
  const cases = [
    ["Quest:2202015", 4, "Old Stone Chamber", "world-d-a-dungeon-4add5a21e73284a1"],
    ["Quest:2202020", 9, "Den of the Dead", "world-d-a-dungeon-affa4bea67d55478"],
    ["Quest:2202023", 2, "Quai Merchants Temporary Storage", "world-d-a-dungeon-aafd66854b6133f8"],
    ["Quest:2202036", 3, "Spirit Temple", "world-d-a-dungeon-d120cc2a0db8e6af"],
    ["Quest:2202037", 12, "Relic Storage", "world-d-a-dungeon-0414b1aa8c267e1d"],
    ["Quest:2202038", 3, "Blood Haven", "world-d-a-dungeon-d03567fff2e3234e"],
    ["Quest:2202040", 10, "Tarzel Depository", "world-d-a-dungeon-78c72b3a023e52e1"],
    ["Quest:2202042", 3, "Lagta Underground Prison", "world-d-a-dungeon-ce29bd5df5980828"],
    ["Quest:2202045", 2, "Mysterious Ruins", "world-d-a-dungeon-afa1f33bb20fb23d"],
    ["Quest:2202046", 3, "Destruction Archons Library", "world-d-a-dungeon-091da35feb320d5d"],
  ];
  const candidates = await markers("world-d-a");
  const map = await json("public/maps/world-d-a/metadata.json");
  for (const [questId, step, phrase, markerId] of cases) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const row = objective(entry, step, "Clear Map Event");
    const target = targetFor(entry, row, candidates, phrase);
    const point = map.locations.find((location) => location.id === markerId);
    assert.equal(target?.markerId, markerId, questId);
    assert.equal(point?.name, `${phrase} Entrance`, questId);
    assert.equal(point?.category, "dungeon", questId);
  }
});

test("unlinked faction story destinations open their named published entrances", async () => {
  const cases = [
    ["Quest:1102170", 1, "Illusion Sanctum", "world-l-a", "world-l-a-dungeon-92334848ff606674"],
    ["Quest:1102100", 3, "Etheria Rift", "world-l-a", "world-l-a-dungeon-99cf3536a0aa3199"],
    ["Quest:1102910", 1, "Illusion Hideout", "world-l-a", "world-l-a-dungeon-4e6b1f213d20d564"],
    ["Quest:1202014", 4, "Bandit Den", "world-l-a", "world-l-a-dungeon-0affe47c7ca62949"],
    ["Quest:1202015", 3, "Scarlotus Experiment Site", "world-l-a", "world-l-a-dungeon-e1dcb97953aa3424"],
    ["Quest:1202019", 4, "Abandoned Drakan Prison", "world-l-a", "world-l-a-dungeon-8046bc5099b2e4ed"],
    ["Quest:1202020", 4, "Old Hideout", "world-l-a", "world-l-a-dungeon-c902950c77aa6f93"],
    ["Quest:1202024", 10, "Hidden Storage", "world-l-a", "world-l-a-dungeon-6082ec760e606eb2"],
    ["Quest:1202036", 2, "Fallen Relic Storage", "world-l-a", "world-l-a-dungeon-0b7e57baeb3965eb"],
    ["Quest:1202039", 3, "Zumion Trial Hall", "world-l-a", "world-l-a-dungeon-976c0952f5355c17"],
    ["Quest:1202041", 4, "Surana Refinery", "world-l-a", "world-l-a-dungeon-ebc9f600e25b763b"],
    ["Quest:1202046", 3, "Penitent Altar", "world-l-a", "world-l-a-dungeon-5e797a5ca1641deb"],
    ["Quest:1202046", 5, "Illusion Hideout", "world-l-a", "world-l-a-dungeon-4e6b1f213d20d564"],
    ["Quest:2101050", 3, "Tunapre Lake Cave", "world-d-starter", "world-d-starter-dungeon-935665eaf076ee23"],
    ["Quest:2102065", 3, "Shaded Cave", "world-d-a", "world-d-a-dungeon-d1cc5255ce0734a7"],
    ["Quest:2102260", 2, "Root of the Sacred Tree", "world-d-a", "world-d-a-dungeon-3a6b87bbf26d9b39"],
  ];
  const markerCache = new Map();
  const metadataCache = new Map();
  for (const [questId, step, phrase, mapId, markerId] of cases) {
    const entry = await quest(createHash("sha256").update(questId).digest("hex").slice(0, 2), questId);
    const row = entry.sections.find((section) => section.title === "reference.labels.objectives")?.rows
      ?.find((candidate) => candidate.name.startsWith(`${step} · `)
        && findQuestLocationName(candidate.description, phrase) >= 0);
    assert.ok(row, `${questId} step ${step}`);
    if (!markerCache.has(mapId)) markerCache.set(mapId, await markers(mapId));
    if (!metadataCache.has(mapId)) metadataCache.set(mapId, await json(`public/maps/${mapId}/metadata.json`));
    const target = targetFor(entry, row, markerCache.get(mapId), phrase);
    const point = metadataCache.get(mapId).locations.find((marker) => marker.id === markerId);
    assert.equal(target?.markerId, markerId, questId);
    assert.ok(["dungeon", "instance-entrance"].includes(point?.category), questId);
    assert.ok(point.name.toLowerCase().includes(phrase.toLowerCase()), questId);
  }
});
