/** Corroborate item spell trigger codes against local item classes and names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (name) => JSON.parse(await readFile(join(root, "data/client-research", name), "utf8"));
const items = await read("item-sparse-catalog.json");
const effects = await read("item-effect-links.json");
if (items.source.build !== effects.source.build || items.source.product !== effects.source.product) {
  throw new Error("Item and effect sources do not share a game build");
}
const byId = new Map(items.records.map((record) => [record.itemId, record]));
const codes = [...new Set(effects.records.map((record) => record.triggerCode))].sort((a, b) => a - b);
if (JSON.stringify(codes) !== "[0,1,2,5,6,7,9]") throw new Error("Unexpected item effect trigger codes");
const hit = effects.records.filter((record) => record.triggerCode === 2);
if (hit.some((record) => byId.get(record.itemId)?.className !== "Weapon")) {
  throw new Error("Hit-trigger evidence includes a nonweapon item");
}
const semantics = { 0: "use", 1: "equipped", 2: "chance-on-hit",
  5: "pickup", 6: "learn", 7: "looted", 9: "pickup" };
const groups = codes.map((code) => {
  const records = effects.records.filter((record) => record.triggerCode === code);
  const classCounts = Object.fromEntries([...new Set(records.map((record) => byId.get(record.itemId)?.className))]
    .sort().map((itemClass) => [itemClass, records.filter((record) => byId.get(record.itemId)?.className === itemClass).length]));
  return { code, semantic: semantics[code], count: records.length, classCounts,
    examples: records.filter((record) => !/\btest\b/i.test(record.itemName)).slice(0, 12)
      .map(({ itemId, itemName, spellId, spellName }) => ({ itemId, itemName, spellId, spellName })) };
});
const report = { source: effects.source,
  rule: "Trigger code meanings follow TrinityCore ItemSpelltriggerType and are corroborated by local names: 0 use, 1 equipped, 2 proc, 5 pickup, 6 learn, 7 looted, 9 forced pickup. Code 2 links belong to weapons with hit effects. The data does not establish a proc percentage or spell magnitude beyond the spell name.",
  groups };
await writeFile(join(root, "data/client-research/item-effect-trigger-semantics.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(groups.map(({ code, semantic, count }) => `${code}:${semantic}:${count}`).join(" "));
