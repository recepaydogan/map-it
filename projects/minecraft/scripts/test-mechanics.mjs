import assert from "node:assert/strict";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { groupEnchantmentEquipment } from "../src/features/knowledge/enchantment-equipment-groups.ts";
import { createMechanicsInspectorResolver, createMechanicsSubjectDisplay } from "../src/features/knowledge/mechanics-inspector-content.ts";
import { resolveBuiltInMechanicsCatalog } from "../src/features/knowledge/built-in-mechanics-catalog.ts";
import { gameKnowledgeSubjectDisplay } from "../src/features/knowledge/game-knowledge-subject-display.ts";
import { buildBedrockMechanicsArtifact } from "./normalize-bedrock-mechanics.mjs";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const revision = "a".repeat(40), sourceUrl = `https://example.test/catalog/${revision}`;
const provenance = path => ({ path, sha256: "b".repeat(64), url: `${sourceUrl}/${path}` });
const copy = (name, description) => ({ en: { name, ...(description ? { description } : {}) }, tr: { name: `TR ${name}` } });
const ref = (kind, id, extra = {}) => ({ kind, id, ...extra });
const artifact = () => ({
  schemaVersion: 1, kind: "mechanics-catalog",
  source: { edition: "edition-a", version: "1.2.3", revision, title: "Fixture knowledge", url: sourceUrl },
  subjects: [
    { kind: "entity", id: "fixture:mount", text: copy("Mount", "A fixture entity."),
      artwork: "/knowledge-data/fixture/mount.png" },
    { kind: "item", id: "fixture:tack", text: copy("Tack") },
    { kind: "item", id: "fixture:hide", text: copy("Hide") },
    { kind: "item", id: "fixture:token", text: copy("Token") },
  ],
  mechanics: [
    { id: "fixture:equip_mount", kind: "equipment", subject: ref("entity", "fixture:mount"), text: copy("Equip mount"),
      requirements: [ref("item", "fixture:tack", { count: { min: 1, max: 1 }, note: { en: "After the prerequisite state." } })],
      inputs: [], outputs: [], related: [], provenance: provenance("equip.json") },
    { id: "fixture:mount_drop", kind: "drop", subject: ref("entity", "fixture:mount"), text: copy("Mount drops"),
      requirements: [], inputs: [], outputs: [ref("item", "fixture:hide", { count: { min: 0, max: 2 }, chance: 0.75 })],
      related: [], provenance: provenance("drop.json") },
    { id: "fixture:token_use", kind: "use", subject: ref("item", "fixture:token"), text: copy("Use token"),
      requirements: [], inputs: [ref("item", "fixture:token", { count: { min: 1, max: 1 } })], outputs: [],
      related: [ref("entity", "fixture:mount")], provenance: provenance("use.json") },
  ],
});
const parse = value => parseMechanicsCatalogArtifact(value, { edition: "edition-a", version: "1.2.3" });
const translate = (key, values = {}) => `${key}${Object.keys(values).length ? `:${Object.values(values).join("-")}` : ""}`;
const fallback = (kind, id) => ({ name: `${kind}:${id}` });

check("exact-version mechanics rebuild a bidirectional subject index from validated records", () => {
  const catalog = parse(artifact());
  assert.equal(catalog.subjects.length, 4); assert.equal(catalog.mechanics.length, 3);
  assert.deepEqual(catalog.index["entity:fixture:mount"], ["fixture:equip_mount", "fixture:mount_drop", "fixture:token_use"]);
  assert.deepEqual(catalog.index["item:fixture:tack"], ["fixture:equip_mount"]);
  assert.throws(() => { catalog.index["item:fixture:tack"].push("bad"); }, TypeError);
});

check("subject details group owned mechanics and reverse involvement without duplicating them", () => {
  const catalog = parse(artifact()), resolve = createMechanicsInspectorResolver(catalog, fallback, translate, "en");
  const mount = resolve({ kind: "entity", id: "fixture:mount" });
  assert.equal(mount.name, "Mount"); assert.deepEqual(mount.sections.map(section => section.key),
    ["mechanics:equipment:requirements", "mechanics:drop", "involved:relatedTo:use"]);
  assert.equal(mount.sections[1].previewSize, 4);
  assert.equal(mount.sections[1].links[0].subject.id, "fixture:hide");
  assert.match(mount.sections[1].links[0].note, /0-2/); assert.match(mount.sections[1].links[0].note, /75%/);
  assert.equal(mount.sections[2].links[0].subject.id, "fixture:token");
  const token = resolve({ kind: "item", id: "fixture:token" });
  assert.equal(token.sections.length, 1); assert.equal(token.sections[0].links.length, 1);
  const hide = resolve({ kind: "item", id: "fixture:hide" });
  assert.equal(hide.sections[0].links[0].subject.id, "fixture:mount");
  assert.equal(hide.sections[0].title, "inspector.relationshipTitles.droppedBy");
  assert(!hide.sections.flatMap(section => section.links).some(link => link.subject.kind === "mechanic"));
});

check("breaking a block into its matching item does not repeat the current subject", () => {
  const value = artifact();
  value.subjects.push({ kind: "block", id: "fixture:self-drop", text: copy("Self drop") });
  value.subjects.push({ kind: "item", id: "fixture:self-drop", text: copy("Self drop") });
  value.mechanics.push({ id: "fixture:self_drop", kind: "breaking", subject: ref("block", "fixture:self-drop"),
    text: copy("Self drop drops"), requirements: [], inputs: [],
    outputs: [ref("item", "fixture:self-drop", { count: { min: 1, max: 1 } })], related: [], provenance: provenance("self-drop.json") });
  const resolve = createMechanicsInspectorResolver(parse(value), fallback, translate, "en", undefined, new Set(["fixture:self-drop"]));
  assert.equal(resolve({ kind: "block", id: "fixture:self-drop" }).sections.length, 0);
  assert.equal(resolve({ kind: "item", id: "fixture:self-drop" }).sections.length, 0);
  const naturalSource = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({ kind: "item", id: "fixture:self-drop" });
  assert.equal(naturalSource.sections[0].title, "inspector.relationshipTitles.obtainedByBreaking");
});

check("loot sources stay out of item details", () => {
  const value = artifact();
  value.mechanics.push({ id: "fixture:chest_loot", kind: "loot", subject: ref("loot", "fixture:chest"), text: copy("Chest loot"),
    requirements: [], inputs: [], outputs: [ref("item", "fixture:tack")], related: [], provenance: provenance("chest.json") });
  value.subjects.push({ kind: "loot", id: "fixture:chest", text: copy("Chest") });
  const content = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({ kind: "item", id: "fixture:tack" });
  assert(!content.sections.some(section => section.key.includes("loot")));
});

check("mechanic details preserve localized names, structured requirements, ranges and probabilities", () => {
  const catalog = parse(artifact()), resolve = createMechanicsInspectorResolver(catalog, fallback, translate, "en");
  const equipment = resolve({ kind: "mechanic", id: "fixture:equip_mount" });
  assert.equal(equipment.sections[1].links[0].quantity, 1);
  assert.match(equipment.sections[1].links[0].note, /prerequisite/);
  const drop = resolve({ kind: "mechanic", id: "fixture:mount_drop" });
  assert.match(drop.sections[1].links[0].note, /0-2/); assert.match(drop.sections[1].links[0].note, /75%/);
  assert.equal(createMechanicsSubjectDisplay(catalog, fallback, "tr")("entity", "fixture:mount").name, "TR Mount");
  assert.equal(createMechanicsSubjectDisplay(catalog, fallback, "en")("entity", "fixture:mount").image,
    "/knowledge-data/fixture/mount.png");
});

check("missing descriptions stay hidden instead of exposing catalog implementation notes", () => {
  const catalog = parse(artifact()), resolve = createMechanicsInspectorResolver(catalog, fallback, translate, "en");
  assert.equal(resolve({ kind: "item", id: "fixture:tack" }).description, undefined);
  assert.equal(resolve({ kind: "mechanic", id: "fixture:equip_mount" }).description, undefined);
});

check("authored subject summaries replace generated world-generation jargon", () => {
  const value = artifact();
  value.mechanics.push({ id: "fixture:mount_generation", kind: "generation", subject: ref("entity", "fixture:mount"),
    text: copy("Mount generation", "Technical registry details."), requirements: [], inputs: [], outputs: [], related: [],
    provenance: provenance("mount-generation.json") });
  const resolve = createMechanicsInspectorResolver(parse(value), fallback, translate, "en", undefined, new Set(),
    (kind, id) => kind === "entity" && id === "fixture:mount" ? "A clear player-facing summary." : undefined);
  assert.equal(resolve({ kind: "entity", id: "fixture:mount" }).description, "A clear player-facing summary.");
});

check("advancement subjects and relationships stay out of the inspector", () => {
  const value = artifact();
  value.subjects.push({ kind: "advancement", id: "fixture:goal", text: copy("Goal", "Complete the goal.") });
  value.mechanics.push({ id: "fixture:goal_progress", kind: "progression", subject: ref("advancement", "fixture:goal"),
    text: copy("Goal progress", "Challenge advancement with 4 criteria."), requirements: [], inputs: [], outputs: [],
    related: [ref("item", "fixture:token")], provenance: provenance("goal.json") });
  const content = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({ kind: "advancement", id: "fixture:goal" });
  assert.equal(content, null);
  const resolve = createMechanicsInspectorResolver(parse(value), fallback, translate, "en");
  assert.equal(resolve({ kind: "mechanic", id: "fixture:goal_progress" }), null);
  const token = resolve({ kind: "item", id: "fixture:token" });
  assert.equal(token.sections.length, 1);
});

check("enchantment compatibility collapses material variants into highlighted equipment types", () => {
  const requirements = [
    ref("item", "minecraft:leather_boots"),
    ref("item", "minecraft:diamond_boots"),
    ref("item", "minecraft:leather_leggings"),
    ref("item", "minecraft:diamond_leggings"),
    ref("item", "minecraft:leather_chestplate"),
    ref("item", "minecraft:diamond_chestplate"),
    ref("item", "minecraft:leather_helmet"),
    ref("item", "minecraft:turtle_helmet"),
  ];
  assert.deepEqual(groupEnchantmentEquipment(requirements).map(group => group.type), ["boots", "leggings", "chestplates", "helmets"]);
  const value = artifact();
  value.subjects.push({ kind: "enchantment", id: "minecraft:test_protection", text: copy("Test Protection") });
  value.subjects.push({ kind: "enchantment", id: "minecraft:test_other", text: copy("Test Other") });
  for (const requirement of requirements) value.subjects.push({ kind: "item", id: requirement.id, text: copy(requirement.id) });
  value.mechanics.push({ id: "fixture:test_enchantment", kind: "enchanting",
    subject: ref("enchantment", "minecraft:test_protection"), text: copy("Test Protection"), requirements, inputs: [], outputs: [],
    related: [ref("enchantment", "minecraft:test_other")],
    enchantment: { maxLevel: 4, weight: 2, anvilCost: 4, slots: ["Armor"], effects: ["Damage Protection"] },
    provenance: provenance("enchantment.json") });
  value.mechanics.push({ id: "fixture:test_other_enchantment", kind: "enchanting",
    subject: ref("enchantment", "minecraft:test_other"), text: copy("Test Other"), requirements: [], inputs: [], outputs: [],
    related: [ref("enchantment", "minecraft:test_protection")],
    enchantment: { maxLevel: 1, weight: 1, anvilCost: 8, slots: ["Armor"], effects: [] },
    provenance: provenance("other-enchantment.json") });
  const content = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({
    kind: "enchantment", id: "minecraft:test_protection",
  });
  assert(!content.sections.some(section => section.key.endsWith(":requirements")));
  assert.equal(content.sections.length, 1);
  assert.equal(content.sections[0].title, "inspector.enchantmentConflicts");
  assert.deepEqual(content.sections[0].links.map(link => link.subject.id), ["minecraft:test_other"]);
  assert.equal(content.body.props.maximumLevel, 4);
  assert.deepEqual(content.body.props.equipment, ["inspector.enchantmentEquipmentTypes.boots", "inspector.enchantmentEquipmentTypes.leggings",
    "inspector.enchantmentEquipmentTypes.chestplates", "inspector.enchantmentEquipmentTypes.helmets"]);
  assert.deepEqual(content.body.props.effects, ["Damage Protection"]);
  const boots = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({
    kind: "item", id: "minecraft:diamond_boots",
  });
  assert.equal(boots.sections[0].title, "inspector.relationshipTitles.availableEnchantments");
});

check("empty drops and advancement relationships never create placeholder mechanic cards", () => {
  const value = artifact();
  value.subjects.push({ kind: "entity", id: "fixture:helper", text: copy("Helper", "This entity has no direct item drops.") });
  value.subjects.push({ kind: "advancement", id: "fixture:friend", text: copy("Friend", "Befriend the helper.") });
  value.mechanics.push({ id: "fixture:helper_drop", kind: "drop", subject: ref("entity", "fixture:helper"),
    text: copy("Helper drops", "This entity has no direct item drops."), requirements: [], inputs: [], outputs: [], related: [],
    provenance: provenance("helper.json") });
  value.mechanics.push({ id: "fixture:friend_progress", kind: "progression", subject: ref("advancement", "fixture:friend"),
    text: copy("Friend progress"), requirements: [], inputs: [], outputs: [], related: [ref("entity", "fixture:helper")],
    provenance: provenance("friend.json") });
  const content = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({ kind: "entity", id: "fixture:helper" });
  assert.equal(content.sections.length, 0);
  assert(!content.sections.flatMap(section => section.links).some(link => link.subject.kind === "mechanic"));
});

check("trade subjects show direct transactions grouped by profession level", () => {
  const value = artifact();
  value.subjects.push({ kind: "trade", id: "fixture:armorer", text: copy("Armorer trades") });
  value.mechanics.push({ id: "fixture:armorer_trade", kind: "trade", subject: ref("trade", "fixture:armorer"),
    text: copy("Token for hide"), requirements: [], inputs: [ref("item", "fixture:token", { count: { min: 4, max: 4 } })],
    outputs: [ref("item", "fixture:hide", { count: { min: 1, max: 1 } })], related: [],
    trade: { level: 2, maxUses: 12, experience: 5 }, provenance: provenance("armorer/2/token_hide.json") });
  const content = createMechanicsInspectorResolver(parse(value), fallback, translate, "en")({ kind: "trade", id: "fixture:armorer" });
  assert.deepEqual(content.sections.map(section => section.key), ["mechanics:trade:2"]);
  assert.equal(content.sections[0].title, "inspector.tradeLevels.2");
  assert.deepEqual(content.sections[0].links[0].subject, { kind: "mechanic", id: "fixture:armorer_trade" });
  assert.equal(content.sections[0].links[0].transaction.inputs[0].quantity, 4);
  assert.equal(content.sections[0].links[0].transaction.outputs[0].name, "Hide");
  assert.equal(content.sections[0].links[0].note, undefined);
  const illustrated = (_kind, id) => ({ name: id === "fixture:token" ? "Token" : id === "fixture:hide" ? "Hide" : `${_kind}:${id}`,
    ...(id === "fixture:token" || id === "fixture:hide" ? { image: `/items/${id.split(":")[1]}.png` } : {}) });
  const details = createMechanicsInspectorResolver(parse(value), illustrated, translate, "en")(content.sections[0].links[0].subject);
  assert.deepEqual(details.pillSections[0].values, ["inspector.tradeLevels.2"]);
  assert.equal(details.pillSections[0].title, "inspector.tradeLevel");
  assert.equal(details.name, "4× Token → 1× Hide");
  assert.equal(details.description, undefined);
  assert.deepEqual(details.iconImages, ["/items/token.png", "/items/hide.png"]);
  assert.deepEqual(details.sections.map(section => section.key), ["subject", "inputs", "outputs"]);
  assert.equal(details.sections[0].title, "inspector.tradeProfession");
  assert.equal(details.sections[0].links[0].name, "Armorer");
});

check("edition, version and revision-bearing provenance fail closed", () => {
  assert.throws(() => parseMechanicsCatalogArtifact(artifact(), { edition: "other", version: "1.2.3" }), /exact edition and version/);
  const wrong = artifact(); wrong.mechanics[0].provenance.url = "https://example.test/unpinned/equip.json";
  assert.throws(() => parse(wrong), /provenance revision/);
  const insecure = artifact(); insecure.source.url = `http://example.test/${revision}`;
  assert.throws(() => parse(insecure), /source URL/);
});

check("each mechanic may pin a different source revision without weakening URL identity", () => {
  const value = artifact(), mechanicRevision = "source-article-v2";
  value.mechanics[0].provenance = { ...value.mechanics[0].provenance, revision: mechanicRevision,
    url: `https://example.test/source/${mechanicRevision}/equip.json` };
  assert.equal(parse(value).mechanics[0].provenance.revision, mechanicRevision);
  value.mechanics[0].provenance.url = "https://example.test/source/unpinned/equip.json";
  assert.throws(() => parse(value), /provenance revision/);
});

check("duplicate identities, unknown subjects and invalid chance never enter the graph", () => {
  const duplicate = artifact(); duplicate.subjects.push(structuredClone(duplicate.subjects[0]));
  assert.throws(() => parse(duplicate), /Duplicate knowledge subject/);
  const unknown = artifact(); unknown.mechanics[0].requirements[0].id = "fixture:missing";
  assert.throws(() => parse(unknown), /unknown knowledge subject/);
  const chance = artifact(); chance.mechanics[1].outputs[0].chance = 1.01;
  assert.throws(() => parse(chance), /chance/);
  const trade = artifact(); trade.mechanics[0].trade = { level: 0 };
  assert.throws(() => parse(trade), /trade mechanic|Trade data/);
  const externalArtwork = artifact(); externalArtwork.subjects[0].artwork = "https://example.test/mount.png";
  assert.throws(() => parse(externalArtwork), /subject artwork/);
});

check("Bedrock source normalization creates broad drops and grouped villager trades without invented probabilities", () => {
  const source = { edition: "bedrock", version: "1.21.120", repository: "Mojang/bedrock-samples", revision,
    lootPrefix: "behavior_pack/loot_tables/entities/", tradePrefix: "behavior_pack/trading/economy_trades/",
    entityPrefix: "behavior_pack/entities/" };
  const files = [
    { path: `${source.entityPrefix}horse.json`, sha256: "b".repeat(64), text: JSON.stringify({ "minecraft:entity": {
      description: { identifier: "minecraft:horse" }, component_groups: { adult: {
        "minecraft:loot": { table: "loot_tables/entities/horse.json" },
        "minecraft:tamemount": { feed_items: [{ item: "wheat", temper_mod: 3 }] },
        "minecraft:equippable": { slots: [{ item: "saddle", accepted_items: ["saddle"] }] },
        "minecraft:breedable": { breed_items: ["golden_carrot"] },
      } },
    } }) },
    { path: `${source.lootPrefix}horse.json`, sha256: "c".repeat(64), text: JSON.stringify({ pools: [{ entries: [{
      type: "item", name: "minecraft:leather", functions: [{ function: "set_count", count: { min: 0, max: 2 } }],
    }] }] }) },
    { path: `${source.tradePrefix}farmer_trades.json`, sha256: "d".repeat(64), text: JSON.stringify({ tiers: [{ groups: [{
      num_to_select: 1, trades: [{ wants: [{ item: "minecraft:wheat", quantity: 20 }], gives: [{ item: "minecraft:emerald", quantity: 1 }] }],
    }] }] }) },
  ];
  const raw = buildBedrockMechanicsArtifact(files, source), catalog = parseMechanicsCatalogArtifact(raw, source);
  assert.equal(raw.report.redistributionApproved, false); assert.equal(catalog.mechanics.length, 5);
  const drop = catalog.mechanics.find(entry => entry.kind === "drop"), trade = catalog.mechanics.find(entry => entry.kind === "trade");
  assert.deepEqual(drop.outputs[0].count, { min: 0, max: 2 }); assert.equal(drop.outputs[0].chance, undefined);
  assert.equal(trade.inputs[0].count.min, 20); assert.equal(trade.outputs[0].id, "minecraft:emerald");
  assert.deepEqual(trade.subject, { kind: "trade", id: "minecraft:trade/farmer" });
  assert(catalog.subjects.every(subject => !subject.text.en.description));
  assert(catalog.mechanics.every(mechanic => !mechanic.text.en.description));
  assert(catalog.mechanics.every(mechanic => [...mechanic.inputs, ...mechanic.outputs].every(ref => !ref.note)));
  assert.deepEqual(new Set(catalog.mechanics.map(entry => entry.kind)), new Set(["drop", "trade", "taming", "equipment", "breeding"]));
});

check("the built-in entity, drop and trade slice is exact-version gated, source pinned and illustrated", () => {
  const translate = (locale, key) => `${locale}:${key}`;
  const java20 = resolveBuiltInMechanicsCatalog("java", "1.20.6", "tr", translate);
  const java21 = resolveBuiltInMechanicsCatalog("java", "1.21.3", "en", translate);
  assert.ok(java20); assert.ok(java21);
  assert.equal(resolveBuiltInMechanicsCatalog("java", "1.21.10", "en", translate), null);
  const bedrock = resolveBuiltInMechanicsCatalog("bedrock", "1.21.120", "en", translate);
  assert.ok(bedrock);
  assert.equal(java20.subjects.length, 20); assert.equal(java20.mechanics.length, 10);
  assert.equal(bedrock.subjects.length, 20); assert.equal(bedrock.mechanics.length, 11);
  assert.equal(java20.source.title, "tr:knowledge.horse.catalogTitle");
  const drop20 = java20.mechanics.find(entry => entry.id === "minecraft:horse/drop_leather");
  const drop21 = java21.mechanics.find(entry => entry.id === "minecraft:horse/drop_leather");
  assert.equal(drop20.outputs[0].count.min, 0); assert.equal(drop20.outputs[0].count.max, 2);
  assert.equal(drop20.provenance.sha256, "13ab80c2f547eb78109ffe99d56f4d96b46c226683e2be9f65772bece87fca26");
  assert.equal(drop21.provenance.sha256, "ec75aaecbfa0191ae31463e83b857674d184697ce1bff38996a83bc915b80e3c");
  assert.match(drop20.provenance.url, new RegExp(drop20.provenance.revision));
  assert.ok(java20.index["poi:minecraft:village"].includes("minecraft:horse/find"));
  const horse = createMechanicsSubjectDisplay(java20, gameKnowledgeSubjectDisplay, "en")("entity", "minecraft:horse");
  assert.equal(horse.name, "en:knowledge.horse.subjects.horse.name");
  assert.equal(horse.image, "/guide-entities/minecraft_horse.png");
  assert.equal(gameKnowledgeSubjectDisplay("entity", "minecraft:cat").image, "/guide-entities/minecraft_cat.png");
  assert.equal(gameKnowledgeSubjectDisplay("entity", "minecraft:evocation_illager").image, "/guide-entities/minecraft_evoker.png");
  const taming = createMechanicsSubjectDisplay(java20, gameKnowledgeSubjectDisplay, "en")("mechanic", "minecraft:horse/tame");
  assert.equal(taming.image.kind, "sprite"); assert.equal(`${taming.image.column}:${taming.image.row}`, "3:2");
  const farmerTrade = bedrock.mechanics.find(entry => entry.id === "minecraft:villager/farmer_buy_wheat");
  assert.equal(farmerTrade.kind, "trade"); assert.equal(farmerTrade.inputs[0].count.min, 20);
  assert.equal(farmerTrade.outputs[0].id, "minecraft:emerald");
  assert.equal(farmerTrade.provenance.sha256, "4ca2c74b9e6d625b8f85d7a29d8d2b09e0584318e96582766f1d63678a659f98");
  const emeraldDetails = createMechanicsInspectorResolver(bedrock, gameKnowledgeSubjectDisplay, key => key, "en")({ kind: "item", id: "minecraft:emerald" });
  assert.equal(emeraldDetails.sections[0].key, "involved:obtainedFrom:trade");
  assert.equal(emeraldDetails.sections[0].title, "inspector.relationshipTitles.availableFromTrades");
});

console.log(`${checks} mechanics catalog checks passed.`);
