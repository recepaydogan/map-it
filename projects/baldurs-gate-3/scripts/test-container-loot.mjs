import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(projectRoot, "public", "maps");
const vaultFiveId = "859ec79c-8f81-44e1-b044-bc834cf33acc";
let appearances = 0;
let itemEntries = 0;
let randomPoolAppearances = 0;
let randomPoolEntries = 0;
let possibleLootEntries = 0;
let chestAppearances = 0;
let vaultFive = null;
let grymforgeVasePool = null;
let skeletonPool = null;
let blackMyconidPool = null;

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  const locationsPath = path.join(mapsRoot, directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
  for (const location of locations) {
    const categories = new Set([location.category, ...(location.categoryFacets ?? [])]);
    if (categories.has("chest")) {
      assert.ok(!categories.has("loot-container"), `${directory.name}:${location.id} appears in both container filters.`);
      assert.doesNotMatch(location.name, /\bchest key\b/i, `${directory.name}:${location.id} classifies a chest key as a chest.`);
    }
  }
  const locationsByContentId = new Map(locations.map((location) => [location.contentId, location]));
  for (const entity of Object.values(content.entities ?? {})) {
    for (const pool of [
      ...(entity.deathLoot?.randomLootPools ?? []),
      ...(entity.containerLoot?.randomLootPools ?? []),
    ]) {
      if (pool.tableId === "GEN_Skeleton_Generic") skeletonPool ??= pool;
      if (pool.tableId === "UND_Myconid_Black") blackMyconidPool ??= pool;
    }
    if (!entity.containerLoot) continue;
    appearances += 1;
    const location = locationsByContentId.get(entity.id);
    assert.ok(location, `${directory.name}:${entity.id} container contents have no marker.`);
    const categories = new Set([location.category, ...(location.categoryFacets ?? [])]);
    const containerCategories = ["chest", "loot-container"].filter((category) => categories.has(category));
    assert.equal(
      containerCategories.length,
      1,
      `${directory.name}:${entity.id} must appear in exactly one container filter.`,
    );
    const isChest = containerCategories[0] === "chest";
    if (isChest) chestAppearances += 1;
    assert.doesNotMatch(location.name, /^LOOT\s+(?:GEN|CHA)\b/i, `${directory.name}:${entity.id} exposes an editor-only container name.`);
    assert.ok(
      entity.containerLoot.items.length > 0 || entity.containerLoot.randomLootPools.length > 0,
      `${entity.id} has an empty container-loot profile.`,
    );
    for (const item of entity.containerLoot.items) {
      assert.ok(item.itemName && item.title, `${entity.id} has an unresolved placed item.`);
      assert.ok(Number.isFinite(item.amount) && item.amount > 0, `${entity.id}:${item.itemName} has invalid amount.`);
      assert.ok(item.difficulties.every((difficulty) => ["explorer", "balanced", "tactician", "honour"].includes(difficulty)));
      itemEntries += 1;
    }
    if (entity.containerLoot.randomLootPools.length > 0) randomPoolAppearances += 1;
    for (const pool of entity.containerLoot.randomLootPools) {
      assert.ok(pool.tableId, `${entity.id} has a random loot pool without an id.`);
      assert.ok(Array.isArray(pool.stockCategories) && Array.isArray(pool.namedStock));
      assert.ok(Array.isArray(pool.possibleLoot), `${entity.id}:${pool.tableId} has no possible-loot projection.`);
      for (const outcome of pool.possibleLoot) {
        assert.ok(outcome.id && outcome.title, `${entity.id}:${pool.tableId} has an unresolved possible outcome.`);
        assert.ok(["item", "category"].includes(outcome.kind), `${entity.id}:${pool.tableId}:${outcome.id} has an invalid kind.`);
        assert.ok(outcome.initialChance > 0 && outcome.initialChance <= 100,
          `${entity.id}:${pool.tableId}:${outcome.id} has an invalid initial chance.`);
        possibleLootEntries += 1;
      }
      if (directory.name === "grymforge" && entity.title === "Vase" && pool.tableId === "UND_KC_Shar_Shrine") {
        grymforgeVasePool = pool;
      }
      randomPoolEntries += 1;
    }
    if (entity.id === vaultFiveId) vaultFive = entity.containerLoot;
  }
}

assert.ok(appearances >= 250, `Expected at least 250 placed-content marker appearances; received ${appearances}.`);
assert.ok(itemEntries >= 350, `Expected at least 350 exact placed item entries; received ${itemEntries}.`);
assert.ok(randomPoolAppearances >= 500, `Expected at least 500 random-loot container appearances; received ${randomPoolAppearances}.`);
assert.ok(randomPoolEntries >= 500, `Expected at least 500 random loot pool entries; received ${randomPoolEntries}.`);
assert.ok(possibleLootEntries >= 500, `Expected at least 500 possible loot entries; received ${possibleLootEntries}.`);
assert.ok(chestAppearances >= 100, `Expected at least 100 chest appearances; received ${chestAppearances}.`);
assert.ok(grymforgeVasePool, "Grymforge vases have no random loot projection.");
assert.equal(grymforgeVasePool.possibleLoot.find(({ statsId }) => statsId === "OBJ_Candle_Gold")?.initialChance, 13.33);
assert.equal(grymforgeVasePool.possibleLoot.find(({ statsId }) => statsId === "OBJ_Skull")?.initialChance, 6.67);
assert.ok(skeletonPool, "Generic skeleton possible loot is missing from the map data.");
assert.equal(skeletonPool.possibleLoot.find(({ statsId }) => statsId === "OBJ_Bone")?.initialChance, 37.5);
assert.equal(skeletonPool.possibleLoot.find(({ statsId }) => statsId === "WPN_Dagger")?.initialChance, 12.5);
assert.ok(blackMyconidPool, "Black myconid possible loot is missing from the map data.");
assert.ok(blackMyconidPool.possibleLoot.some(({ statsId }) => statsId === "OBJ_Myconid_Flesh"),
  "CanMerge treasure tables dropped the black myconid's base loot.");
assert.ok(vaultFive, "Known Counting House Vault nº5 contents are missing from the map data.");
assert.ok(vaultFive.items.some(({ itemName }) => itemName === "S_LOW_CountingHouse_Vault5_MorningStar"));
assert.ok(vaultFive.items.some(({ itemName }) => itemName === "S_LOW_CountingHouse_Vault5_Book"));

console.log(`Container loot: ${appearances} marker appearances (${chestAppearances} chests) with ${itemEntries} exact items and ${randomPoolEntries} random loot pools.`);
