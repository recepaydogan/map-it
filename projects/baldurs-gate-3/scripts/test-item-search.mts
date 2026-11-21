import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createItemSearchDocuments,
  searchItemDocuments,
} from "../src/features/items/item-search.ts";
import {
  createItemDatabaseIndex,
  resolveItemDatabaseEntry,
} from "../src/features/items/item-database-match.ts";
import type { ItemDatabaseCatalog } from "../src/features/items/types.ts";

const catalogPath = path.resolve(import.meta.dirname, "../public/data/item-database.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as ItemDatabaseCatalog;
const documents = createItemSearchDocuments(catalog.items, "en");

const stylizedResult = searchItemDocuments(documents, "sickle of boal", "en");
assert.equal(stylizedResult[0]?.name, "Sickle of BOOOAL");
assert.equal(stylizedResult[0]?.statsId, "UNI_SickleOfBOOOAL");

const typoResult = searchItemDocuments(documents, "everbun blade", "en");
assert.equal(typoResult[0]?.name, "Everburn Blade");

const itemIndex = createItemDatabaseIndex(catalog.items);
const githyankiShortsword = resolveItemDatabaseEntry(itemIndex, {
  statsId: "WPN_Shortsword_Gith",
  itemName: "WPN_GTY_Shortsword_A",
  title: "Githyanki Shortsword",
});
assert.equal(githyankiShortsword?.name, "Githyanki Shortsword");
assert.equal(githyankiShortsword?.icon?.atlas !== undefined, true);

const sickleByDisplayName = resolveItemDatabaseEntry(itemIndex, {
  title: "Sickle of BOOOAL",
});
assert.equal(sickleByDisplayName?.statsId, "UNI_SickleOfBOOOAL");

console.log("Item search and map-loot item matching verified.");
