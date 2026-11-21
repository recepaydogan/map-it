/** Reuse reviewed UI text only where the English source and meaning agree. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const pairs = [
  ["database.theostoneSlots", "reference.labels.monolith-sources"],
  ["database.specialItems.duration", "spells.duration"],
  ["database.craftedFrom", "reference.labels.crafted-from"],
  ["database.usedInRecipes", "reference.labels.used-in-recipes"],
  ["intel.titles.faction", "map.foreverQuest.faction"],
  ["intel.skills.class", "map.characters.class"],
  ["intel.skills.skill", "professions.leveling.skillColumn"],
  ["intel.titles.allFactions", "professions.trainers.allFactions"],
  ["reference.labels.choose-a-reward", "map.foreverQuest.chooseReward"],
  ["map.merchant.tabs.all", "database.allItems"],
  ["map.merchant.tabs.other", "database.acquisition.otherDrops"],
  ["map.merchant.kinah", "reference.labels.monolith-sources"],
  ["map.merchant.bundle", "database.acquisition.bundle"],
  ["map.storage.price", "reference.labels.monolith-sources"],
  ["map.storage.character", "reference.labels.character-storage"],
  ["map.storage.contents", "reference.labels.monolith-sources"],
  ["map.storage.samePrices", "reference.labels.monolith-sources"],
  ["map.storage.separatePrices", "reference.labels.monolith-sources"],
  ["reference.achievement.region", "reference.adventure.region"],
  ["reference.achievement.rewardLabel", "map.foreverQuest.rewards"],
  ["reference.achievement.points", "classGuide.full.pointsAllocated_other"],
  ["reference.activity.level", "classes.level"],
  ["reference.activity.rewardLevel", "map.resurrection.characterLevel"],
  ["reference.collectible.region", "reference.adventure.region"],
  ["reference.collectible.exchangeCost", "reference.labels.monolith-sources"],
  ["reference.collectible.rewards", "reference.labels.monolith-sources"],
  ["reference.collectible.selectLevel", "reference.labels.monolith-sources"],
  ["reference.collectible.level", "reference.labels.monolith-sources"],
  ["reference.collectible.itemRewards", "map.foreverQuest.rewards"],
  ["reference.companions.level", "map.characters.level"],
  ["reference.companions.levelValue", "classes.level"],
  ["reference.adventure.relatedQuests", "dungeonQuest.relatedQuests"],
  ["reference.categories.world-bosses", "events.types.world-boss"],
  ["reference.creatureGroups.bosses", "reference.labels.bosses"],
  ["reference.labels.level", "map.characters.level"],
  ["reference.labels.set-bonuses", "database.clientItem.setBonuses"],
  ["reference.sets.quality", "database.clientItem.changeFields.quality"],
  ["reference.guildHall.currency", "reference.labels.monolith-sources"],
  ["reference.labels.gathering-results", "reference.adventure.gatheringResults"],
  ["reference.adventure.questSections", "map.foreverQuest.title"],
  ["reference.labels.previous-quest", "map.foreverQuest.earlier"],
  ["reference.labels.next-quest", "map.foreverQuest.following"],
  ["reference.boss.region", "reference.adventure.region"],
  ["reference.boss.allRegions", "reference.adventure.allRegions"],
  ["reference.activity.rewardChance", "database.acquisition.rewardChance"],
  ["map.resurrection.levelOption", "classes.level"],
  ["map.resurrection.kinah", "reference.labels.monolith-sources"],
  ["reference.boxes.levelRange", "reference.loot.levelRange"],
  ["reference.labels.class", "map.characters.class"],
  ["reference.labels.destination", "map.eventEntrance.destination"],
  ["reference.travel.allRegions", "reference.adventure.allRegions"],
  ["reference.travel.allFactions", "professions.trainers.allFactions"],
  ["reference.travel.factions.All", "reference.adventure.factions.All"],
  ["reference.boss.rawCycle", "map.riftSchedule.everyMinutes"],
  ["reference.labels.required-level", "map.foreverQuest.requiredLevel"],
  ["reference.worldObject.locked", "overlay.minimap.locked"],
];
const get = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);
const set = (object, key, value) => {
  const path = key.split(".");
  let node = object;
  for (const part of path.slice(0, -1)) node = node[part] ??= {};
  node[path.at(-1)] = value;
};
const path = join(root, "data/app-localization/active-ui-reuse.json");
const existing = await readFile(path, "utf8").then(JSON.parse, () => ({}));
const result = {};
for (const [target, source] of pairs) {
  if (get(english, target) !== get(english, source)) {
    throw new Error(`English source mismatch: ${target} / ${source}`);
  }
}
for (const language of languages) {
  const locale = await read(`src/i18n/locales/${language}.json`);
  const entries = {};
  for (const [target, source] of pairs) {
    const value = get(locale, source);
    const current = get(locale, target);
    if ((current === undefined || (get(existing[language], target) !== undefined && current === value)) &&
      typeof value === "string" && value.trim()) {
      set(entries, target, value);
    }
  }
  result[language] = entries;
}
const output = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== await readFile(path, "utf8")) throw new Error("Active UI reuse catalog is stale");
} else await writeFile(path, output);
const count = (node) => Object.values(node).reduce((sum, value) =>
  sum + (typeof value === "string" ? 1 : count(value)), 0);
console.log(Object.fromEntries(languages.map((language) => [language, count(result[language])])));
