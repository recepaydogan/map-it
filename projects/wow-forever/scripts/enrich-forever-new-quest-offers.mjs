/** Attach ID-specific quest summaries to the existing Forever-new giver pins. */
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const path = "public/maps/world-atlas/locations-forever-new-quest-givers.json";
const [giverData, questDetails, itemCatalog] = await Promise.all([
  readJson(path),
  readJson("public/data/quests/quest-details.json"),
  readJson("public/data/items/catalog.json"),
]);
const items = new Map(itemCatalog.items.map((item) => [item.id, item]));
const offerIds = new Set(giverData.locations.flatMap((giver) => giver.questOffers.map((offer) => offer.id)));
let enriched = 0;

for (const giver of giverData.locations) {
  for (const offer of giver.questOffers) {
    const details = questDetails.quests[offer.id];
    if (!details?.objectiveItem && !details?.objectiveItems?.length && !details?.currencyRewards?.length && !details?.reward) continue;
    if (details.title !== offer.name || details.level !== offer.level) {
      throw new Error(`Quest ${offer.id} conflicts with the world-map offer`);
    }
    delete offer.objectiveItem;
    delete offer.objectiveItems;
    delete offer.currencyRewards;
    delete offer.reward;
    if (details.objectiveItem) {
      const item = items.get(details.objectiveItem.id);
      if (!item || item.name !== details.objectiveItem.name
        || item.grade !== details.objectiveItem.quality) {
        throw new Error(`Quest ${offer.id} objective item does not match the item catalog`);
      }
      offer.objectiveItem = { ...details.objectiveItem, icon: item.icon };
    }
    if (details.objectiveItems?.length) {
      for (const objectiveItem of details.objectiveItems) {
        const item = items.get(objectiveItem.id);
        if (!item || item.name !== objectiveItem.name || item.icon !== objectiveItem.icon
          || !Number.isInteger(objectiveItem.quantity) || objectiveItem.quantity <= 0) {
          throw new Error(`Quest ${offer.id} objective item list does not match the item catalog`);
        }
      }
      offer.objectiveItems = details.objectiveItems;
    }
    if (details.currencyRewards?.length) {
      for (const currency of details.currencyRewards) {
        if (!currency.id || !currency.name || !Number.isInteger(currency.quantity)
          || currency.quantity <= 0 || !currency.icon?.startsWith("data/quests/icons/")) {
          throw new Error(`Quest ${offer.id} has an invalid currency reward`);
        }
        await readFile(`public/${currency.icon}`);
      }
      offer.currencyRewards = details.currencyRewards;
    }
    if (details.reward) offer.reward = details.reward;
    if (details.objectiveItem || details.objectiveItems?.length || details.currencyRewards?.length || details.reward) enriched++;
  }
}

for (const quest of Object.values(questDetails.quests)) {
  if ((quest.objectiveItem || quest.objectiveItems?.length) && !offerIds.has(quest.id)) {
    throw new Error(`Quest ${quest.id} has an objective item but no world-map offer`);
  }
}

const output = `${JSON.stringify(giverData, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Forever-new quest offers are out of date");
} else {
  await writeFile(path, output);
}
console.log(`Enriched ${enriched} Forever-new quest offers.`);
