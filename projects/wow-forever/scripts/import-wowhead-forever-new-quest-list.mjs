/** Import quest metadata only when Wowhead's ID, title, and level match the map. */
import { readFile, writeFile } from "node:fs/promises";

const htmlPath = process.argv[2];
if (!htmlPath) throw new Error("Pass the saved Wowhead Forever quest list HTML path.");

const html = await readFile(htmlPath, "utf8");
const marker = "data:[";
const start = html.indexOf(marker);
if (start < 0 || html.indexOf(marker, start + marker.length) >= 0) throw new Error("Expected one quest list");
let end = start + marker.length - 1;
let depth = 0;
let quoted = false;
let escaped = false;
for (; end < html.length; end++) {
  const character = html[end];
  if (escaped) { escaped = false; continue; }
  if (quoted && character === "\\") { escaped = true; continue; }
  if (character === '"') { quoted = !quoted; continue; }
  if (quoted) continue;
  if (character === "[") depth++;
  if (character === "]" && --depth === 0) { end++; break; }
}
if (depth || quoted) throw new Error("Incomplete quest list");
const rows = JSON.parse(html.slice(start + marker.length - 1, end));
const mapCatalog = JSON.parse(await readFile("public/data/quests/world-map-new-quests.json", "utf8"));
const itemCatalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const itemEnrichment = JSON.parse(await readFile("public/data/items/foreverdb-enrichment.json", "utf8"));
if (itemEnrichment.version !== 2 || !Array.isArray(itemEnrichment.newItems)) {
  throw new Error("Invalid ForeverDB item enrichment");
}
const items = new Map([...itemEnrichment.newItems, ...itemCatalog.items].map((item) => [item.id, item]));
const mapQuests = new Map(mapCatalog.quests.map((quest) => [quest.id, quest]));
const catalogPath = "public/data/quests/quest-details.json";
let source = await readFile(catalogPath, "utf8");
const catalog = JSON.parse(source);
const matched = [];
const conflicts = [];
const missingItems = new Set();

for (const row of rows) {
  const mapQuest = mapQuests.get(String(row.id));
  if (!mapQuest) continue;
  const titleMatches = row.name === mapQuest.title
    || mapQuest.title.startsWith(`${row.name} (`) && mapQuest.title.endsWith(")");
  if (!titleMatches || row.level !== mapQuest.level) {
    conflicts.push({ id: row.id, map: mapQuest.title, page: row.name, mapLevel: mapQuest.level, pageLevel: row.level });
    continue;
  }
  const metadata = {};
  if (Number.isInteger(row.reqlevel) && row.reqlevel > 0) metadata.minimumLevel = row.reqlevel;
  if ([1, 2, 3].includes(row.side)) metadata.faction = { 1: "Alliance", 2: "Horde", 3: "Both" }[row.side];
  if (Number.isInteger(row.xp) && row.xp > 0) metadata.experience = row.xp;
  const choices = Array.isArray(row.itemchoices) ? row.itemchoices : [];
  const rewards = Array.isArray(row.itemrewards) ? row.itemrewards : [];
  const mapRewards = (rewardRows) => {
    const mapped = rewardRows.map(([id, quantity]) => {
      const item = items.get(String(id));
      if (!item) { missingItems.add(String(id)); return null; }
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid reward quantity for ${row.id}`);
      return { id: String(id), name: item.name, quantity };
    });
    return mapped.length && mapped.every(Boolean) ? mapped : [];
  };
  if (choices.length && rewards.length) {
    const mappedChoices = mapRewards(choices);
    const mappedRewards = mapRewards(rewards);
    if (mappedChoices.length) metadata.rewardChoices = mappedChoices;
    if (mappedRewards.length) metadata.rewardItems = mappedRewards;
  } else {
    const mapped = mapRewards(choices.length ? choices : rewards);
    if (mapped.length) metadata.rewards = mapped;
    if (mapped.length && choices.length) metadata.rewardChoice = true;
  }
  if (row.currencyrewards?.length) {
    const currency = row.currencyrewards.map(([id, quantity]) => id === 3402 && Number.isInteger(quantity) && quantity > 0
      ? { id: "3402", name: "Merchant's Favor", quantity, icon: "data/quests/icons/merchants-favor.jpg" } : null);
    if (currency.every(Boolean)) metadata.currencyRewards = currency;
    else conflicts.push({ id: row.id, reason: "unknown-currency", ids: row.currencyrewards.map(([id]) => id) });
  }
  matched.push({ id: String(row.id), title: mapQuest.title, sourceTitle: row.name, level: row.level, metadata });
}

let added = 0;
let updated = 0;
const newEntries = [];
for (const row of matched) {
  const current = catalog.quests[row.id];
  let correctedRewards;
  const changes = Object.entries(row.metadata).filter(([key, value]) => {
    if (current?.[key] === undefined) return true;
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      if (key === "rewards" && Array.isArray(current[key]) && Array.isArray(value)
        && current[key].length === value.length
        && current[key].every((item, index) => item.id === value[index].id)) {
        correctedRewards = value;
        return false;
      }
      conflicts.push({ id: row.id, key, current: current[key], page: value });
    }
    return false;
  });
  if (!current) {
    newEntries.push(`    ${JSON.stringify(row.id)}: ${JSON.stringify({ id: row.id, title: row.title, level: row.level,
      ...Object.fromEntries(changes), evidence: "community-reported", detailEvidence: "community-reported" }, null, 2)
      .replace(/\n/g, "\n    ")}`);
    added++;
    continue;
  }
  if (![row.title, row.sourceTitle].includes(current.title) || current.level !== row.level) {
    throw new Error(`Catalog identity mismatch for ${row.id}`);
  }
  if (!changes.length && !correctedRewards) continue;
  const header = `    ${JSON.stringify(row.id)}: {`;
  const blockStart = source.indexOf(header);
  const endMatch = /^    }(?=,?\r?\n)/m.exec(source.slice(blockStart + header.length));
  if (blockStart < 0 || !endMatch) throw new Error(`Quest block not found for ${row.id}`);
  const blockEnd = blockStart + header.length + endMatch.index + endMatch[0].length;
  let block = source.slice(blockStart, blockEnd);
  if (correctedRewards) {
    const replacement = JSON.stringify(correctedRewards, null, 2).replace(/\n/g, "\n      ");
    const changed = block.replace(/^      "rewards": \[[\s\S]*?^      \],/m,
      `      "rewards": ${replacement},`);
    if (changed === block) throw new Error(`Could not correct rewards for ${row.id}`);
    block = changed;
  }
  const lines = changes.flatMap(([key, value]) => {
    const json = JSON.stringify(value, null, 2).replace(/\n/g, "\n      ");
    return `      ${JSON.stringify(key)}: ${json},`;
  }).join("\n");
  block = block.replace(/^(      "level": \d+,\r?\n)/m, `$1${lines}\n`);
  source = source.slice(0, blockStart) + block + source.slice(blockEnd);
  updated++;
}
if (newEntries.length) {
  const boundary = '\n  },\n  "markerQuestIds": {';
  if (!source.includes(boundary)) throw new Error("Quest catalog boundary missing");
  source = source.replace(boundary, `,\n${newEntries.join(",\n")}${boundary}`);
}
const next = JSON.parse(source);
for (const row of matched) {
  const quest = next.quests[row.id];
  if (!quest || ![row.title, row.sourceTitle].includes(quest.title) || quest.level !== row.level) {
    throw new Error(`Quest ${row.id} was not imported`);
  }
}
if (process.argv.includes("--check")) {
  if (source !== await readFile(catalogPath, "utf8")) throw new Error("Quest list metadata is out of date");
} else {
  await writeFile(catalogPath, source);
}
console.log(JSON.stringify({ listed: rows.length, matched: matched.length, added, updated, conflicts, missingItems: [...missingItems] }, null, 2));
