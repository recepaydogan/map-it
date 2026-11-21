import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GAME_CONFIG, gameEventTextKey } from "../src/game-config.ts";

const directory = "public/data/game-locales";
const read = async (name) => JSON.parse(await readFile(join(directory, name), "utf8"));
const manifest = await read("manifest.json");
const source = await read("source.json");
const itemIndex = await read("item-key-index.json");
const itemCatalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const scheduledEvents = JSON.parse(await readFile("public/data/event-schedule.json", "utf8"));
assert.equal(manifest.version, 1);
assert.equal(source.version, 1);
assert.equal(source.keys.length, manifest.entries);
assert.equal(source.values.length, manifest.entries);
assert.deepEqual(Object.keys(manifest.locales).sort(),
  Object.values(GAME_CONFIG.gameLocaleCodes ?? {}).sort());
assert.equal(source.keys.length, new Set(source.keys).size, "Localization keys must be unique.");
assert.equal(itemIndex.version, 1);
const catalogItems = new Map(itemCatalog.items.map((item) => [item.id, item]));
for (const itemId of Object.keys(itemIndex.entries)) {
  assert(catalogItems.has(itemId), `Locale index points to an unknown item: ${itemId}`);
}
for (const item of itemCatalog.items) {
  const index = itemIndex.entries[item.id];
  if (index === undefined) {
    assert(item.nameVerified && item.name?.trim(), `Missing English fallback for item ${item.id}`);
    continue;
  }
  assert.ok(Number.isInteger(index) && index >= 0 && index < source.keys.length,
    `Missing item locale key: ${item.id}`);
  assert.ok(typeof source.values[index] === "string" && source.values[index].trim(),
    `Missing source text for item ${item.id}`);
}
const sampleIndex = source.values.findIndex((value) => typeof value === "string" && value.length > 0);
assert.ok(sampleIndex >= 0);
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
for (const event of scheduledEvents) {
  const key = gameEventTextKey(event.id);
  assert.ok(key && sourceIndices.has(key), `Missing game text key for ${event.id}`);
  assert.equal(source.values[sourceIndices.get(key)], event.name, `Wrong game text key for ${event.id}`);
}
for (const [locale, details] of Object.entries(manifest.locales)) {
  if (locale === "en-US") continue;
  const pack = await read(`${locale}.json`);
  assert.equal(pack.version, 1, locale);
  assert.equal(pack.values.length, source.keys.length, locale);
  assert.equal(pack.values.filter((value) => typeof value === "string" && value.length > 0).length,
    details.entries, `${locale} entry count`);
  assert.ok(pack.values[sampleIndex], `${locale} sample translation`);
  for (const event of scheduledEvents) {
    assert.ok(pack.values[sourceIndices.get(gameEventTextKey(event.id))],
      `${locale} has no title for ${event.id}`);
  }
  for (const item of itemCatalog.items) {
    const index = itemIndex.entries[item.id];
    if (index !== undefined) assert.ok(pack.values[index], `${locale} has no name for item ${item.id}`);
  }
}
console.log(`Game locale checks passed for ${Object.keys(manifest.locales).length} languages and ${source.keys.length} keys.`);
