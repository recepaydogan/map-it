import { readFileSync, writeFileSync } from "node:fs";

const existing = JSON.parse(readFileSync("public/data/items/catalog.json", "utf8"));
const source = JSON.parse(readFileSync("data/site-research/warcraft-forever-items/index.json", "utf8"));

if (existing.version !== 2 || !Array.isArray(existing.items) || existing.items.length !== 19171
  || source.count !== 21767 || source.ids.length !== source.count) {
  throw new Error("Unexpected item catalogs; refusing to overwrite the legacy item archive.");
}

const siteIds = new Set(source.ids.map(String));
const items = existing.items.filter((item) => !siteIds.has(item.id));
if (items.length !== 1664 || new Set(items.map((item) => item.id)).size !== items.length) {
  throw new Error(`Unexpected number of legacy-only items: ${items.length}.`);
}

writeFileSync("data/site-research/warcraft-forever-items/legacy-only-items.json", `${JSON.stringify({ version: 2, items, recipes: [] })}\n`);
console.log(`Archived ${items.length} legacy-only items.`);
