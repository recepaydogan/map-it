import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { GAME_GUIDE_BREWING, GAME_GUIDE_SOURCES, GAME_JAVA_GUIDE_RELEASES, GAME_JAVA_GUIDE_RECIPE_SOURCES,
  GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS, GAME_GUIDE_LEGACY_BEDROCK_ENTITIES, GAME_GUIDE_NON_MOB_ENTITIES,
  GAME_RECIPE_SOURCES, GAME_STRUCTURE_TYPES,
  gameGuideItemType } from "../src/game-config.ts";
import { parseItemCatalogArtifact } from "../src/features/knowledge/item-catalog-artifact.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { filterMechanicsCatalogToItems } from "../src/features/knowledge/filter-knowledge-catalogs.ts";
import { mergeRecipeCatalogs } from "../src/features/knowledge/merge-recipe-catalogs.ts";
import { recipeSlotLayout } from "../src/features/knowledge/recipe-slot-layout.ts";
import { gameKnowledgeBiomeFamily, gameKnowledgeGuideSubject, gameKnowledgeInventorySubjects, gameKnowledgeRecipeSubjectKind,
  gameKnowledgeSubjectDisplay } from "../src/features/knowledge/game-knowledge-subject-display.ts";
import { GUIDE_KINDS } from "../src/features/knowledge/game-guide-categories.ts";
import i18n from "../src/i18n/index.ts";

const checked = new Set(), checkedEntities = new Set();
assert.deepEqual(GAME_GUIDE_SOURCES.filter(source => source.gameId === "minecraft" && source.edition === "java")
  .map(source => source.version), GAME_JAVA_GUIDE_RELEASES.map(release => release.version));
assert.equal(GAME_JAVA_GUIDE_RECIPE_SOURCES.length, GAME_JAVA_GUIDE_RELEASES.length);
assert(GAME_GUIDE_SOURCES.filter(source => source.gameId === "minecraft" && source.edition === "java")
  .every(source => source.recipeIdentity), "Every Java guide release must have an exact recipe source");
assert(!GUIDE_KINDS.includes("advancement"), "Advancements must remain hidden from the guide UI");
assert(!GUIDE_KINDS.includes("block"), "Blocks must be included in the item guide category");
assert.equal(gameKnowledgeRecipeSubjectKind("minecraft:crafting_table"), "block");
assert.equal(gameKnowledgeRecipeSubjectKind("minecraft:stick"), "item");
assert.equal(gameKnowledgeSubjectDisplay("tag", "minecraft:planks").name, "Planks", "Ingredient groups must use their in-game-facing name without a technical prefix");
assert.equal(gameGuideItemType("minecraft:oak_planks", true), "blocks");
assert.equal(gameGuideItemType("minecraft:diamond_pickaxe", false), "equipment");
assert.equal(gameGuideItemType("minecraft:compass", false), "equipment");
assert.equal(gameGuideItemType("minecraft:cooked_beef", false), "food");
assert.equal(gameGuideItemType("minecraft:cake", true), "food");
assert.equal(gameGuideItemType("minecraft:splash_potion/strong_healing", false), "brewing");
assert.equal(gameGuideItemType("minecraft:creeper_spawn_egg", false), "spawnEggs");
assert.equal(gameGuideItemType("minecraft:diamond", false), "other");
assert.equal(gameKnowledgeInventorySubjects.length, 1794, "Reviewed canonical inventory registry coverage changed");
assert.equal(new Set(gameKnowledgeInventorySubjects.map(subject => `${subject.kind}:${subject.id}`)).size,
  gameKnowledgeInventorySubjects.length, "Inventory guide subjects must be unique");
assert(gameKnowledgeInventorySubjects.every(subject => subject.kind === "item"), "Every inventory subject must be listed as an item");
for (const alias of ["minecraft:potion/Awkward", "minecraft:splash_potion/Awkward", "minecraft:lingering_potion/Awkward",
  "minecraft:potion/Thick", "minecraft:brick_block"]) {
  assert(!gameKnowledgeInventorySubjects.some(subject => subject.id === alias), `${alias} must remain an artwork alias, not an inventory subject`);
}
for (const canonical of ["minecraft:potion/awkward", "minecraft:splash_potion/awkward", "minecraft:lingering_potion/awkward",
  "minecraft:potion/thick", "minecraft:bricks"]) {
  assert(gameKnowledgeInventorySubjects.some(subject => subject.id === canonical), `${canonical} must remain a canonical inventory subject`);
}
const itemCatalogs = new Map();
for (const release of GAME_JAVA_GUIDE_RELEASES) {
  const path = `public/knowledge-data/java/${release.version}/items.json`;
  const catalog = parseItemCatalogArtifact(JSON.parse(await readFile(path, "utf8")), {
    edition: "java", version: release.version, revision: release.registryRevision,
  });
  itemCatalogs.set(release.version, catalog);
  for (const id of catalog.items) {
    const item = gameKnowledgeSubjectDisplay("item", id);
    assert(item.name, `Missing ${release.version} inventory name for ${id}`);
    assert.equal(typeof item.image, "string", `Missing ${release.version} inventory image for ${id}`);
    if (!checked.has(id)) { await access(`public${item.image}`); checked.add(id); }
  }
}
const hasItem = (version, id) => itemCatalogs.get(version).items.includes(`minecraft:${id}`);
const latestVersion = GAME_JAVA_GUIDE_RELEASES[0].version;
const latestMechanics = parseMechanicsCatalogArtifact(JSON.parse(await readFile(
  `public/knowledge-data/java/${latestVersion}/mechanics.json`, "utf8")), { edition: "java", version: latestVersion });
const availableMechanics = filterMechanicsCatalogToItems(latestMechanics,
  new Set(itemCatalogs.get(latestVersion).items));
for (const kind of ["entity", "trade", "enchantment"]) {
  assert(availableMechanics.subjects.some(subject => subject.kind === kind),
    `${latestVersion} must expose ${kind} subjects after item filtering`);
}
assert(hasItem("1.18", "diamond") && !hasItem("1.18", "mangrove_propagule"));
assert(hasItem("1.19", "mangrove_propagule") && !hasItem("1.19", "mace"));
assert(hasItem("1.20.5", "mace") && !hasItem("1.21.3", "copper_spear"));
assert(hasItem("1.21.11", "copper_spear") && !hasItem("26.1", "sulfur"));
assert(hasItem("26.2", "sulfur"));
assert(hasItem("26.3", "poplar_log") && hasItem("26.3", "straw_bed"));
for (const source of GAME_JAVA_GUIDE_RECIPE_SOURCES) {
  const catalog = parseRecipeCatalogArtifact(JSON.parse(await readFile(
    `public/knowledge-data/java/${source.version}/recipes.json`, "utf8")), source);
  assert(catalog.recipes.length > 0, `${source.version} must expose its exact recipe guide`);
}
for (const id of ["minecraft:acacia_boat", "minecraft:birch_boat", "minecraft:bamboo_raft", "minecraft:arrow"]) {
  assert.deepEqual(gameKnowledgeGuideSubject({ kind: "entity", id }), { kind: "item", id }, `${id} must be listed as an item`);
}
assert.deepEqual(gameKnowledgeGuideSubject({ kind: "entity", id: "minecraft:chicken" }),
  { kind: "entity", id: "minecraft:chicken" }, "Mobs with same-named item drops must remain mobs");
for (const subject of gameKnowledgeInventorySubjects) {
  const display = gameKnowledgeSubjectDisplay(subject.kind, subject.id);
  assert(display.name, `Missing inventory name for ${subject.id}`);
  assert.equal(typeof display.image, "string", `Missing inventory image for ${subject.id}`);
  if (!subject.id.includes("/")) assert.equal(display.image, `/guide-artwork/${subject.id.split(":")[1]}.png`,
    `${subject.id} must use its own verified inventory render`);
  if (!checked.has(subject.id)) { await access(`public${display.image}`); checked.add(subject.id); }
}
const digest = async id => createHash("sha256").update(await readFile(`public/guide-artwork/${id}.png`)).digest("hex");
const plankDigest = await digest("oak_planks");
for (const id of ["chest", "trapped_chest", "ender_chest", "red_bed", "white_banner", "tripwire_hook", "shield",
  "skeleton_skull", "shulker_box", "decorated_pot"]) {
  assert.notEqual(await digest(id), plankDigest, `${id} regressed to the oak-planks fallback texture`);
}
for (const id of ["bamboo_sapling", "big_dripleaf_stem", "carrots", "red_candle_cake"]) {
  assert.equal(gameKnowledgeSubjectDisplay("item", `minecraft:${id}`).image, `/guide-artwork/${id}.png`,
    `${id} must use its block-state render instead of the generic fallback icon`);
}
for (const structure of GAME_STRUCTURE_TYPES) {
  assert.equal(typeof structure.artwork, "string", `Missing marker artwork for ${structure.id}`);
  assert.equal(typeof structure.preview, "string", `Missing structure preview for ${structure.id}`);
  await access(`public${structure.artwork}`);
  await access(`public${structure.preview}`);
}
for (const source of GAME_RECIPE_SOURCES) {
  const path = `public/knowledge-data/${source.edition}/${source.version}`;
  const crafting = parseRecipeCatalogArtifact(JSON.parse(await readFile(`${path}/recipes.json`, "utf8")), source);
  const brewing = parseRecipeCatalogArtifact(JSON.parse(await readFile(`${path}/brewing.json`, "utf8")), {
    ...source, revision: source.dialect === "flat" ? GAME_GUIDE_BREWING.java.revision : source.revision });
  const catalog = mergeRecipeCatalogs(crafting, brewing);
  assert.equal(catalog.recipes.length, crafting.recipes.length + brewing.recipes.length);
  assert.throws(() => mergeRecipeCatalogs(crafting, crafting), /duplicate/);
  assert.throws(() => mergeRecipeCatalogs(crafting, { ...brewing, source: { ...brewing.source, version: "other" } }), /same edition and version/);
  assert.equal(mergeRecipeCatalogs(crafting, null), crafting);
  for (const recipe of catalog.recipes) {
    if (recipe.outputs.length) {
      assert(catalog.index.produces[recipe.outputs[0].id].includes(recipe.id));
    } else {
      assert.equal(recipe.method, "smithing", `Only dynamic smithing recipes may omit static outputs: ${recipe.id}`);
    }
    if (recipe.method === "brewing") { assert.equal(recipe.ingredients.length, 2); assert.deepEqual(recipe.stations, [GAME_GUIDE_BREWING.station]); }
    const identities = [...recipe.outputs.map(output => output.id), ...recipe.stations,
      ...recipe.ingredients.flatMap(input => input.choices.flatMap(choice => choice.kind === "item" ? [choice.id] : catalog.index.tagMembers[choice.id] ?? []))];
    for (const id of identities) {
      if (checked.has(id)) continue;
      const image = gameKnowledgeSubjectDisplay("item", id).image;
      assert.equal(typeof image, "string", `No inventory image for ${id}`);
      await access(`public${image}`); checked.add(id);
    }
  }
  const mechanics = parseMechanicsCatalogArtifact(JSON.parse(await readFile(`${path}/mechanics.json`, "utf8")), source);
  for (const subject of mechanics.subjects) {
    const normalized = gameKnowledgeGuideSubject(subject);
    if (normalized.kind !== "item") continue;
    const image = gameKnowledgeSubjectDisplay(normalized.kind, normalized.id).image;
    assert.equal(typeof image, "string", `Missing guide artwork for ${normalized.id}`);
    await access(`public${image}`); checked.add(normalized.id);
  }
  if (source.edition === "java") {
    assert.deepEqual(Object.fromEntries(["loot", "trade", "enchantment", "advancement", "biome", "poi"].map(kind =>
      [kind, mechanics.subjects.filter(subject => subject.kind === kind).length])),
    { loot: 133, trade: 15, enchantment: 43, advancement: 126, biome: 66, poi: 21 });
    assert.deepEqual(Object.fromEntries(["drop", "breaking", "loot", "trade", "enchanting", "progression", "generation"].map(kind =>
      [kind, mechanics.mechanics.filter(mechanic => mechanic.kind === kind).length])),
    { drop: 109, breaking: 1113, loot: 133, trade: 388, enchanting: 43, progression: 126, generation: 100 });
    assert(!mechanics.subjects.some(subject => ["sound", "collection"].includes(subject.kind)));
    const biomeFamilies = mechanics.subjects.filter(subject => subject.kind === "biome")
      .map(subject => gameKnowledgeBiomeFamily(subject.id, key => key));
    assert(!biomeFamilies.includes(null), "Every packaged biome must belong to a compact guide family");
    assert.deepEqual(new Set(biomeFamilies.map(family => family.key)), new Set(["forests", "meadows", "oceans", "mountains", "deserts", "nether", "end"]));
  }
  for (const subject of mechanics.subjects.filter(subject => subject.kind === "entity")) {
    if (GAME_GUIDE_NON_MOB_ENTITIES.has(subject.id)
      || source.edition === "bedrock" && GAME_GUIDE_LEGACY_BEDROCK_ENTITIES.has(subject.id)) continue;
    if (checkedEntities.has(subject.id)) continue;
    const image = gameKnowledgeSubjectDisplay("entity", subject.id).image;
    assert.equal(typeof image, "string", `Missing entity portrait mapping for ${subject.id}`);
    assert(!image.includes("spawn_egg"), `Spawn egg used instead of entity portrait for ${subject.id}`);
    await access(`public${image}`); checkedEntities.add(subject.id);
  }
  for (const subject of mechanics.subjects.filter(subject => subject.kind === "trade")) {
    const image = gameKnowledgeSubjectDisplay("trade", subject.id).image;
    assert.equal(typeof image, "string", `Missing trader portrait mapping for ${subject.id}`);
    assert(!image.includes("emerald"), `Emerald used instead of a trader portrait for ${subject.id}`);
    await access(`public${image}`);
  }
  console.log(`${source.edition}: ${catalog.recipes.length} indexed recipes, ${brewing.recipes.length} brewing recipes verified.`);
}
const input = id => ({ choices: [{ kind: "item", id }], count: 1 });
assert.deepEqual(recipeSlotLayout({ method: "shaped", grid: { width: 2, height: 2, slots: [0, 1, 2, 3] }, ingredients: [0, 1, 2, 3].map(id => input(String(id))) }).map(choice => choice?.id),
  ["0", "1", undefined, "2", "3", undefined, undefined, undefined, undefined]);
assert.deepEqual(recipeSlotLayout({ method: "shaped", grid: { width: 3, height: 1, slots: [null, 0, null] }, ingredients: [input("center")] }).map(choice => choice?.id),
  [undefined, "center", undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
assert.equal(recipeSlotLayout({ method: "shapeless", ingredients: [{ ...input("repeated"), count: 4 }] }).filter(Boolean).length, 4);
assert.deepEqual(recipeSlotLayout({ method: "smithing", ingredients: ["template", "base", "addition"].map(input) }).map(choice => choice.id), ["template", "base", "addition"]);
assert.deepEqual(recipeSlotLayout({ method: "brewing", ingredients: ["water_bottle", "nether_wart"].map(input) }).map(choice => choice.id),
  ["water_bottle", "nether_wart"], "Brewing placement must retain both the bottle and reagent");
const englishNames = Object.fromEntries([...GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS].map(id =>
  [id, gameKnowledgeSubjectDisplay("item", `minecraft:${id}`).name]));
for (const language of ["en", "es", "fr", "hi-IN", "pt-BR", "zh-Hans"]) {
  await i18n.changeLanguage(language);
  assert.equal(gameKnowledgeSubjectDisplay("biome", "minecraft:dappled_forest").name,
    i18n.t("biomeMap.biomes.dappledForest"));
  for (const id of GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS) {
    const name = gameKnowledgeSubjectDisplay("item", `minecraft:${id}`).name;
    assert.equal(name, i18n.t(`inspector.itemGuide.nameOverrides.${id}`));
    if (language === "hi-IN") assert.notEqual(name, englishNames[id], `Hindi item name remains English: ${id}`);
  }
}
await i18n.changeLanguage("en");
console.log(`${checked.size} item images and ${checkedEntities.size} entity portraits verified; grid placement and source isolation checks passed.`);
