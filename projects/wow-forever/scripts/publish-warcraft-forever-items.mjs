import { existsSync, readFileSync, writeFileSync } from "node:fs";

const sourceDir = "data/site-research/warcraft-forever-items";
const index = JSON.parse(readFileSync(`${sourceDir}/index.json`, "utf8"));
const details = readFileSync(`${sourceDir}/details.ndjson`, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const byId = new Map(details.map((item) => [item.id, item]));
if (index.count !== 21767 || details.length !== index.count || byId.size !== index.count
  || index.ids.some((id) => !byId.has(id))) {
  throw new Error(`Incomplete Warcraft Forever source: ${byId.size}/${index.count} unique item details.`);
}

const capitalize = (word) => word[0].toUpperCase() + word.slice(1);
const optional = (condition, object) => condition ? object : {};
const items = index.ids.map((id) => {
  const record = byId.get(id);
  if (typeof record.name !== "string" || !record.name.trim()
    || record.class === undefined && ![122270, 122284].includes(id)
    || record.class !== undefined && typeof record.class !== "string" || typeof record.quality !== "string"
    || typeof record.level !== "number" || !/^[a-z0-9_-]+$/i.test(record.icon)) {
    throw new Error(`Invalid source item ${id}.`);
  }
  const iconFile = `data/items/site-icons/${record.icon}.jpg`;
  const iconAvailable = existsSync(`public/${iconFile}`);
  const stats = [
    ...(record.armor > 0 ? [{ key: "armor", label: "database.clientItem.stat.armor", value: String(record.armor) }] : []),
    ...(record.dmgMin !== undefined && record.dmgMax !== undefined
      ? [{ key: "damage", label: "database.clientItem.damage", value: `${record.dmgMin}–${record.dmgMax}` }] : []),
    ...(record.stats ?? []).map(({ stat, value }, statIndex) => {
      if (typeof stat !== "string" || !Number.isFinite(value)) throw new Error(`Invalid stat on ${id}.`);
      return { key: `site-stat-${statIndex}`, label: stat, value: value > 0 ? `+${value}` : String(value) };
    }),
  ];
  const clientDetails = {
    ...optional(record.maxStack > 1, { stackSize: record.maxStack }),
    ...optional(record.bonding >= 1 && record.bonding <= 4, { bonding: record.bonding }),
    ...optional(record.sellPrice > 0, { sellPriceCopper: record.sellPrice }),
    ...optional(record.speed > 0, { itemDelayMs: Math.round(record.speed * 1000) }),
  };
  const set = record.set;
  return {
    id: String(id),
    name: record.name,
    category: [record.class, record.subclass].filter(Boolean).join(" · ") || "database.clientItem.unclassified",
    grade: capitalize(record.quality),
    ...optional(iconAvailable, { icon: iconFile }),
    nameVerified: true,
    ...optional(record.requiredLevel > 0, { usageLevel: record.requiredLevel }),
    ...optional(record.level > 0, { itemLevel: record.level }),
    ...optional(record.flavor, { description: record.flavor }),
    ...optional(record.slot, { slot: record.slot }),
    ...optional(record.forever === true, { forever: true }),
    ...optional(Array.isArray(record.classes) && record.classes.length > 0 && record.classes.length < 9,
      { allowedClasses: record.classes?.map(capitalize) }),
    ...optional(Array.isArray(record.effects) && record.effects.length > 0,
      { siteEffects: record.effects?.map(({ kind, text }) => ({ kind, text })) }),
    ...(Object.keys(clientDetails).length ? { clientDetails } : {}),
    sections: stats.length ? [{ key: "base", stats }] : [],
    enhancements: [],
    ...optional(set && Array.isArray(set.items), { itemSets: set ? [{
      id: String(set.id), name: set.name,
      memberItemIds: set.items.map((member) => String(member.id)),
      members: set.items.map((member) => ({ id: String(member.id), name: member.name })),
      bonuses: (set.bonuses ?? []).map((bonus) => ({ id: `${set.id}-${bonus.pieces}`,
        requiredPieces: bonus.pieces, spellName: bonus.text })),
    }] : undefined }),
    hasReference: false,
    source: "warcraftforever.games",
  };
});

if (!process.argv.includes("--validate-only")) {
  writeFileSync("public/data/items/catalog.json", `${JSON.stringify({ version: 2, items, recipes: [] })}\n`);
}
console.log(`${process.argv.includes("--validate-only") ? "Validated" : "Published"} ${items.length} Warcraft Forever items from site details.`);
