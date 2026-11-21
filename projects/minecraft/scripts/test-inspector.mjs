import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createInspectorController } from "../src/features/inspector/inspector-controller.ts";
import { GAME_GUIDE_ENTITY_LOOT_ACTIONS, GAME_GUIDE_ITEM_ENTITY_ALIASES, GAME_JAVA_GUIDE_RELEASES,
  GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_HIGHLIGHTS, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { filterMechanicsCatalogToItems } from "../src/features/knowledge/filter-knowledge-catalogs.ts";
import { parseItemCatalogArtifact } from "../src/features/knowledge/item-catalog-artifact.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { createMechanicsInspectorResolver } from "../src/features/knowledge/mechanics-inspector-content.ts";
import { withGameStructureLootSources } from "../src/features/knowledge/game-structure-loot-sources.ts";
import { connectEntityLootActions } from "../src/features/knowledge/connect-entity-loot-actions.ts";
import { withGameEntitySpecialRewards } from "../src/features/knowledge/game-entity-special-rewards.ts";
import { withGameEntityProfiles } from "../src/features/knowledge/game-entity-profiles.ts";
import { createStructureDiscoverySections } from "../src/features/worlds/world-structure-discovery-sections.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const context = { worldId: "world-a", edition: "edition-a", version: "1", dimension: "surface", catalogRevision: "revision-a" };
const subject = (id, kind = "item") => ({ kind, id: `fixture:${id}` });
const make = () => createInspectorController(context);
const current = controller => controller.getSnapshot().entries.at(-1);
const ids = controller => controller.getSnapshot().entries.map(entry => entry.subject.id);
const drill = (controller, id, kind) => controller.navigate(current(controller).key, subject(id, kind));

check("root, recipe and ingredient unwind one level at a time to the base", () => {
  const controller = make(); controller.open(subject("target", "poi"));
  drill(controller, "equipment"); drill(controller, "recipe", "recipe"); drill(controller, "ingredient");
  assert.deepEqual(ids(controller), ["fixture:target", "fixture:equipment", "fixture:recipe", "fixture:ingredient"]);
  for (const expected of ["recipe", "equipment", "target"]) { controller.back(); assert.equal(current(controller).subject.id, `fixture:${expected}`); }
  controller.back(); assert.equal(current(controller), undefined); controller.back();
});
check("view state survives descendant navigation and is pruned with discarded entries", () => {
  const controller = make(); controller.open(subject("root")); const root = current(controller).key;
  controller.saveView(root, { scrollTop: 782.5, focusKey: "input:2" });
  drill(controller, "child"); const child = current(controller).key;
  controller.saveView(child, { scrollTop: 25, focusKey: "input:1" }); controller.back();
  assert.deepEqual(controller.getView(root), { scrollTop: 782.5, focusKey: "input:2" });
  assert.deepEqual(controller.getView(child), { scrollTop: 0, focusKey: null });
  controller.saveView(child, { scrollTop: 8, focusKey: null }); assert.equal(controller.getView(child).scrollTop, 0);
});
check("selecting an existing ancestor returns to its original entry without a cycle", () => {
  const controller = make(); controller.open(subject("root")); const root = current(controller).key;
  drill(controller, "child"); drill(controller, "grandchild"); drill(controller, "root");
  assert.equal(current(controller).key, root); assert.equal(ids(controller).length, 1);
});
check("a root relationship toggles its displayed companion off", () => {
  const controller = make(); controller.open(subject("root")); const root = current(controller).key;
  drill(controller, "child"); controller.navigate(root, subject("child"));
  assert.deepEqual(ids(controller), ["fixture:root"]);
});
check("branching from the retained root drops the old companion history", () => {
  const controller = make(); controller.open(subject("root")); const root = current(controller).key;
  drill(controller, "child"); drill(controller, "grandchild"); const obsolete = current(controller).key;
  controller.navigate(root, subject("other")); controller.navigate(obsolete, subject("late"));
  assert.deepEqual(ids(controller), ["fixture:root", "fixture:other"]);
});
check("companion Close retains the root and its return focus", () => {
  const controller = make(); controller.open(subject("root")); const root = current(controller).key;
  controller.saveView(root, { scrollTop: 42, focusKey: "uses:recipe" }); drill(controller, "child"); drill(controller, "grandchild");
  controller.closeCompanion(); assert.deepEqual(ids(controller), ["fixture:root"]);
  assert.equal(controller.getView(root).focusKey, "uses:recipe"); controller.close(); assert.equal(ids(controller).length, 0);
});
check("world, edition, version, dimension and catalog revision each invalidate the stack", () => {
  for (const key of Object.keys(context)) {
    const controller = make(); controller.open(subject("root")); const root = current(controller).key;
    controller.saveView(root, { scrollTop: 42, focusKey: "uses:recipe" });
    controller.setContext({ ...context, [key]: "changed" }); controller.navigate(root, subject("late"));
    assert.equal(ids(controller).length, 0, key); assert.equal(controller.getView(root).scrollTop, 0, key);
    controller.open(subject("new")); assert.notEqual(current(controller).key, root);
  }
});
check("equivalent context preserves history; view mode is deliberately not world identity", () => {
  const controller = make(); controller.open(subject("root")); drill(controller, "child");
  const before = controller.getSnapshot(); controller.setContext({ ...context });
  assert.equal(controller.getSnapshot(), before);
  assert(!("viewMode" in before.context)); assert(!("camera" in controller));
});
check("snapshots are stable, immutable and detached from caller-owned inputs", () => {
  const initial = { ...context }, input = subject("root"), controller = createInspectorController(initial);
  initial.worldId = "mutated"; controller.open(input); input.id = "mutated";
  const snapshot = controller.getSnapshot(); assert.equal(snapshot, controller.getSnapshot());
  assert.equal(snapshot.context.worldId, context.worldId); assert.equal(snapshot.entries[0].subject.id, "fixture:root");
  assert.throws(() => { snapshot.context.worldId = "bad"; }, TypeError);
  assert.throws(() => { snapshot.entries[0].subject.id = "bad"; }, TypeError);
  assert.throws(() => snapshot.entries.push({}), TypeError);
});
check("view state copies cannot mutate the controller cache", () => {
  const controller = make(); controller.open(subject("root")); const key = current(controller).key;
  const input = { scrollTop: 8, focusKey: "row" }; controller.saveView(key, input); input.scrollTop = 99;
  const read = controller.getView(key); read.scrollTop = 120; assert.equal(controller.getView(key).scrollTop, 8);
});
check("only meaningful navigation publishes and unsubscription stops delivery", () => {
  const controller = make(); let events = 0; const off = controller.subscribe(() => events++);
  controller.open(subject("root")); controller.open(subject("root")); drill(controller, "root");
  controller.saveView(current(controller).key, { scrollTop: 0, focusKey: null }); controller.setContext({ ...context });
  assert.equal(events, 1); drill(controller, "child"); assert.equal(events, 2); off(); controller.back(); assert.equal(events, 2);
});
check("invalid subject and scroll input cannot corrupt a valid stack", () => {
  const controller = make(); controller.open(subject("root")); const before = controller.getSnapshot();
  for (const invalid of [null, { kind: "unknown", id: "id" }, { kind: "item", id: 5 }, { kind: "item", id: " " }, subject("x".repeat(1025))])
    assert.throws(() => controller.open(invalid), /Invalid inspector subject/);
  for (const invalid of [{ scrollTop: NaN, focusKey: null }, { scrollTop: -1, focusKey: null }, { scrollTop: 0, focusKey: 5 }])
    assert.throws(() => controller.saveView(current(controller).key, invalid), /Invalid inspector view state/);
  assert.equal(controller.getSnapshot(), before);
});
check("mechanic subjects use the same bounded Back history as items and entities", () => {
  const controller = make(); controller.open(subject("mount", "entity")); drill(controller, "equip", "mechanic"); drill(controller, "tack", "item");
  assert.deepEqual(controller.getSnapshot().entries.map(entry => entry.subject.kind), ["entity", "mechanic", "item"]);
  controller.back(); assert.equal(current(controller).subject.kind, "mechanic");
});
check("biome inspection is a first-class root in the same bounded Back controller", () => {
  const controller = make(); controller.open(subject("minecraft:plains", "biome"));
  assert.equal(current(controller).subject.kind, "biome");
  drill(controller, "village", "poi"); assert.deepEqual(controller.getSnapshot().entries.map(entry => entry.subject.kind), ["biome", "poi"]);
  controller.back(); assert.equal(current(controller).subject.kind, "biome"); controller.back(); assert.equal(current(controller), undefined);
});
check("history bound explains excess without throwing or losing the originating return path", () => {
  const controller = make(); controller.open(subject("root"));
  for (let i = 1; i < 64; i++) drill(controller, String(i));
  const before = controller.getSnapshot(); drill(controller, "excess");
  assert.deepEqual(controller.getSnapshot().entries, before.entries); assert.equal(ids(controller)[0], "fixture:root");
  assert.equal(controller.getSnapshot().notice, "history-limit");
  const notified = controller.getSnapshot(); drill(controller, "excess"); assert.equal(controller.getSnapshot(), notified);
  controller.back(); assert.equal(controller.getSnapshot().notice, null);
  drill(controller, "replacement"); assert.equal(ids(controller).length, 64);
});
check("every configured structure exposes a valid discovery summary", () => {
  assert.deepEqual(Object.keys(GAME_STRUCTURE_DISCOVERIES).sort(), GAME_STRUCTURE_TYPES.map(type => type.id).sort());
  for (const type of GAME_STRUCTURE_TYPES) {
    const discoveries = GAME_STRUCTURE_DISCOVERIES[type.id];
    assert(discoveries.mobs.length || discoveries.loot.length || GAME_STRUCTURE_HIGHLIGHTS[type.id], type.id);
    const ids = entries => entries.map(entry => typeof entry === "string" ? entry : entry.id);
    assert.equal(new Set(ids(discoveries.mobs)).size, discoveries.mobs.length, `${type.id} mobs`);
    assert.equal(new Set(ids(discoveries.loot)).size, discoveries.loot.length, `${type.id} loot`);
    const sections = createStructureDiscoverySections(discoveries,
      (kind, id) => ({ name: `${kind}:${id}` }), { mobs: "Mobs", loot: "Loot" }, { edition: "java", version: "26.2" });
    assert.equal(sections.flatMap(section => section.links).length, discoveries.mobs.length + discoveries.loot.length, type.id);
    assert(sections.every(section => section.links.every(link => link.subject.kind === (section.key.endsWith("mobs") ? "entity" : "item"))), type.id);
  }
  const outpost = version => createStructureDiscoverySections(GAME_STRUCTURE_DISCOVERIES.outpost,
    (kind, id) => ({ name: `${kind}:${id}` }), { mobs: "Mobs", loot: "Loot" }, { edition: "java", version });
  assert(outpost("1.18.2").flatMap(section => section.links).some(link => link.subject.id === "minecraft:pillager"));
  assert(!outpost("1.18.2").flatMap(section => section.links).some(link => link.subject.id === "minecraft:allay"));
  assert(outpost("1.20.6").flatMap(section => section.links).some(link => link.subject.id === "minecraft:sentry_armor_trim_smithing_template"));
});
check("curated structure loot links back to a navigable structure for each supported edition", () => {
  const translate = (key, values = {}) => key === "inspector.relationshipGroups.obtainedFrom"
    ? `How to obtain it — ${values.kind}` : key;
  const display = (kind, id) => ({ name: `${kind}:${id}` });
  const base = subject => subject.kind === "item" ? { name: "Saddle", category: "Item", sections: [] } : null;
  for (const edition of ["java", "bedrock"]) {
    const resolve = withGameStructureLootSources(base, display, translate,
      { edition, version: edition === "java" ? "26.2" : "26.45" });
    const saddle = resolve({ kind: "item", id: "minecraft:saddle" });
    const sources = saddle.sections.find(section => section.key === "structure:loot-sources");
    assert(sources.links.some(link => link.subject.kind === "poi" && link.subject.id === "minecraft:village"));
    const village = resolve({ kind: "poi", id: "minecraft:village" });
    assert(village.summarySections.some(section => section.key === "structure:loot"
      && section.links.some(link => link.subject.id === "minecraft:saddle")));
  }
});
check("reverse structure loot respects version gates and unrelated editions", () => {
  const display = (kind, id) => ({ name: `${kind}:${id}` });
  const base = () => ({ name: "Fixture", category: "Item", sections: [] });
  const translate = key => key;
  const earlier = withGameStructureLootSources(base, display, translate, { edition: "java", version: "1.18.2" });
  const later = withGameStructureLootSources(base, display, translate, { edition: "java", version: "1.20.6" });
  const item = { kind: "item", id: "minecraft:sentry_armor_trim_smithing_template" };
  assert(!earlier(item).sections.some(section => section.key === "structure:loot-sources"));
  assert(later(item).sections.some(section => section.key === "structure:loot-sources"));
  const unknown = withGameStructureLootSources(base, display, translate, { edition: "unknown", version: "0" });
  assert.equal(unknown, base);
});
for (const { version } of GAME_JAVA_GUIDE_RELEASES) {
  const folder = `public/knowledge-data/java/${version}`;
  const artifact = JSON.parse(await readFile(`${folder}/mechanics.json`, "utf8"));
  const catalog = parseMechanicsCatalogArtifact(artifact, { edition: "java", version });
  const itemArtifact = JSON.parse(await readFile(`${folder}/items.json`, "utf8"));
  const items = parseItemCatalogArtifact(itemArtifact, itemArtifact.source);
  const available = filterMechanicsCatalogToItems(catalog, new Set(items.items));
  const resolve = createMechanicsInspectorResolver(available,
    (kind, id) => ({ name: `${kind}:${id}` }), key => key, "en");
  const droppedBy = id => resolve({ kind: "item", id })?.sections
    .find(section => section.title === "inspector.relationshipTitles.droppedBy")?.links.map(link => link.subject.id) ?? [];
  for (const itemId of ["minecraft:arrow", "minecraft:bone", "minecraft:rotten_flesh"]) {
    assert(droppedBy(itemId).length, `${version} must expose mob sources for ${itemId}`);
  }
  assert(droppedBy("minecraft:arrow").includes("minecraft:skeleton"), `${version} Skeleton arrow drop`);
  assert(droppedBy("minecraft:arrow").includes("minecraft:stray"), `${version} Stray arrow drop`);
  assert(!droppedBy("minecraft:arrow").includes("minecraft:parched") || version.startsWith("26.")
    || version === "1.21.11", `${version} must not show a future mob`);
  assert(resolve({ kind: "entity", id: "minecraft:skeleton" }).sections
    .some(section => section.links.some(link => link.subject.id === "minecraft:arrow")),
  `${version} mob details must link back to dropped items`);
}
console.log(`PASS exact-version mob drops for ${GAME_JAVA_GUIDE_RELEASES.length} Java releases`);
const version = "26.3", folder = `public/knowledge-data/java/${version}`;
const artifact = JSON.parse(await readFile(`${folder}/mechanics.json`, "utf8"));
const itemArtifact = JSON.parse(await readFile(`${folder}/items.json`, "utf8"));
const items = new Set(parseItemCatalogArtifact(itemArtifact, itemArtifact.source).items);
const catalog = connectEntityLootActions(filterMechanicsCatalogToItems(
  parseMechanicsCatalogArtifact(artifact, { edition: "java", version }), items), GAME_GUIDE_ENTITY_LOOT_ACTIONS);
check("26.3 separates real mobs from technical item entities", () => {
  const mobs = catalog.subjects.filter(entry => entry.kind === "entity" && !GAME_GUIDE_ITEM_ENTITY_ALIASES[entry.id]);
  assert.equal(mobs.length, 90);
  assert(!mobs.some(entry => entry.id === "minecraft:poplar_boat"));
});
check("26.3 biome spawn records expose group size and relative weight without calling them probabilities", () => {
  const plains = catalog.mechanics.find(entry => entry.kind === "generation" && entry.subject.id === "minecraft:plains");
  assert.deepEqual(plains.related.find(ref => ref.id === "minecraft:cow").spawn,
    { category: "creature", weight: 8, group: { min: 4, max: 4 } });
  const display = (kind, id) => ({ name: `${kind}:${id}` });
  const biomeFamily = id => ({ key: id, label: id, order: 0 });
  const translate = (key, values = {}) => key === "inspector.mobDetails.spawnEntry"
    ? `${values.category} group ${values.group} weight ${values.weight}` : key;
  const resolve = createMechanicsInspectorResolver(catalog, display, translate, "en", biomeFamily);
  const cow = resolve({ kind: "entity", id: "minecraft:cow" });
  const spawns = cow.sections.find(section => section.key === "entity:spawn-data");
  assert(spawns.links.some(link => link.subject.id === "minecraft:plains" && /weight 8/.test(link.note)));
  assert(cow.facts.some(fact => fact.key === "biome-spawns" && !fact.value.includes("No biome")));
  const wither = resolve({ kind: "entity", id: "minecraft:wither" });
  assert(!wither.facts?.some(fact => fact.key === "biome-spawns"));
  assert(!wither.sections.some(section => section.key === "entity:spawn-data"));
});
check("26.3 loot modifiers preserve base quantities and conditional rare-drop chances", () => {
  const drops = id => catalog.mechanics.find(entry => entry.id === `minecraft:mechanic/loot/entities/${id}`)?.outputs ?? [];
  assert.deepEqual(drops("cow").find(ref => ref.id === "minecraft:leather")?.count, { min: 0, max: 2 });
  assert.deepEqual(drops("cow").find(ref => ref.id === "minecraft:beef")?.count, { min: 1, max: 3 });
  assert.equal(drops("cow").find(ref => ref.id === "minecraft:beef")?.drop?.smeltsWhenBurning, true);
  const skull = drops("wither_skeleton").find(ref => ref.id === "minecraft:wither_skeleton_skull");
  assert.equal(skull?.drop?.requiresPlayerKill, true);
  assert.equal(skull?.drop?.baseChance, 0.025);
  assert.equal(skull?.drop?.lootingFirstChance, 0.035);
  assert.equal(skull?.drop?.lootingChanceStep, 0.01);
  assert.equal(drops("zombie").find(ref => ref.id === "minecraft:iron_ingot")?.drop?.baseChance, undefined);
});
check("curated mob interactions link only items present in the selected version", () => {
  const display = (kind, id) => ({ name: `${kind}:${id}` });
  const base = () => ({ name: "Mob", category: "Mobs", facts: [], sections: [] });
  const resolve = withGameEntityProfiles(base, display, key => key, catalog, items, "java");
  const wolf = resolve({ kind: "entity", id: "minecraft:wolf" });
  assert(wolf.facts.some(fact => fact.key === "behavior"));
  assert(wolf.sections.find(section => section.key === "mob-profile:taming")?.links
    .some(link => link.subject.id === "minecraft:bone"));
  const fortress = resolve({ kind: "entity", id: "minecraft:wither_skeleton" }).sections
    .find(section => section.key === "entity:locations");
  assert(fortress?.links.some(link => link.subject.kind === "poi" && link.subject.id === "minecraft:fortress"));
  assert(!resolve({ kind: "entity", id: "minecraft:cow" }).sections
    .some(section => section.key === "entity:locations"));
  const stripped = withGameEntityProfiles(base, display, key => key, catalog, new Set(), "java");
  assert(!stripped({ kind: "entity", id: "minecraft:wolf" }).sections.some(section => section.key === "mob-profile:taming"));
});
check("26.3 connects special loot tables and honest empty death tables", () => {
  const owned = id => catalog.mechanics.filter(entry => entry.subject.kind === "entity" && entry.subject.id === id);
  assert(owned("minecraft:armadillo").some(entry => entry.kind === "harvesting"
    && entry.outputs.some(output => output.id === "minecraft:armadillo_scute")));
  assert(owned("minecraft:sniffer").some(entry => entry.kind === "harvesting"
    && entry.outputs.some(output => output.id === "minecraft:torchflower_seeds")));
  assert(owned("minecraft:piglin").some(entry => entry.kind === "barter"
    && entry.inputs.some(input => input.id === "minecraft:gold_ingot")));
  assert(owned("minecraft:wither").some(entry => entry.kind === "drop" && !entry.outputs.length));
  const resolve = createMechanicsInspectorResolver(catalog, (kind, id) => ({ name: `${kind}:${id}` }), key => key, "en");
  const wither = resolve({ kind: "entity", id: "minecraft:wither" });
  assert(!wither.description);
  assert(!wither.sections.some(section => section.key === "mechanics:drop"));
});
check("verified rewards navigate from entity to item and back", () => {
  const display = (kind, id) => ({ name: `${kind}:${id}` });
  const resolve = withGameEntitySpecialRewards(() => null, display, key => key, catalog, items, "java");
  const wither = resolve({ kind: "entity", id: "minecraft:wither" });
  assert(wither.sections.some(section => section.links.some(link => link.subject.id === "minecraft:nether_star")));
  const star = resolve({ kind: "item", id: "minecraft:nether_star" });
  assert(star.sections.some(section => section.links.some(link => link.subject.id === "minecraft:wither")));
  assert(resolve({ kind: "entity", id: "minecraft:ender_dragon" }).sections.some(section =>
    section.links.some(link => link.subject.id === "minecraft:dragon_egg")));
  assert(resolve({ kind: "entity", id: "minecraft:wolf" }).sections.some(section =>
    section.links.some(link => link.subject.id === "minecraft:wolf_armor")));
});
console.log(`${checks} inspector checks passed.`);
