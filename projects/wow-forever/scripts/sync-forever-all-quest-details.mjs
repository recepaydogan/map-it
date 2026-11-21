/** Add exact-ID quest facts and rewards from captured Forever list pages. */
import { access, readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const map = await readJson("public/maps/world-atlas/locations-forever-all-quests.json");
const catalog = await readJson("public/data/quests/quest-details.json");
const records = (await readFile("data/site-research/forever-all-detail-pages.jsonl", "utf8"))
  .trim().split("\n").map((line) => JSON.parse(line));
const quests = new Map(records.filter((record) => record.kind === "quest-list")
  .map((record) => [record.id, record]));
const questPages = new Map(records.filter((record) => record.kind === "quest")
  .map((record) => [record.id, record]));
const factions = new Map(records.filter((record) => record.kind === "faction")
  .map((record) => [record.id, record.name]));
const currencies = new Map(records.filter((record) => record.kind === "currency")
  .map((record) => [record.id, record]));
const offers = new Map();
for (const point of map.locations) {
  const id = Number(point.questId);
  if (!offers.has(id)) offers.set(id, []);
  offers.get(id).push(point);
}
if (offers.size !== 4_144 || [...offers.keys()].some((id) => !quests.has(id))) {
  throw new Error("Captured quest list does not cover every map quest");
}
if (process.argv.includes("--require-complete")
  && (questPages.size !== offers.size || [...offers.keys()].some((id) => !questPages.has(id)))) {
  throw new Error(`Quest page text is incomplete: ${questPages.size}/${offers.size}`);
}
const matchTitle = (point, row) => {
  const title = point.category === "dungeon-quest"
    ? point.name.replace(/ \([^)]*\)$/, "") : point.name;
  return title === row.name && point.questLevel === row.level;
};
const itemRows = (record, pairs, knownNames) => pairs.map(([id, quantity]) => {
  const item = record.items[id];
  if (!item) throw new Error(`Quest ${record.id} is missing reward item ${id}`);
  return { id: String(id), name: item.name || knownNames.get(String(id)) || "", quantity,
    ...(item.icon ? { icon: `data/items/site-icons/${item.icon}.jpg` } : {}) };
});
const formatMoney = (amount) => {
  const gold = Math.floor(amount / 10_000);
  const silver = Math.floor(amount % 10_000 / 100);
  const copper = amount % 100;
  return [gold && `${gold}g`, silver && `${silver}s`, copper && `${copper}c`]
    .filter(Boolean).join(" ");
};
// Wowhead sometimes separates paragraphs with <br> inside a completion div.
// Earlier captures used textContent there, which joins adjacent sentences.
const readablePageText = (value) => value?.replace(/([.!?])(?=[A-Z][a-z])/g, "$1 ");
const factionBySide = ["Neutral", "Alliance", "Horde", "Both"];
let itemRewardQuests = 0;
let reputationQuests = 0;
const iconPaths = new Set();
for (const [id, points] of offers) {
  const record = quests.get(id);
  const row = record.row;
  const page = questPages.get(id);
  // Some pages put mapper JSON immediately after the objective with no block
  // boundary. Keep only the visible quest sentence from those captures.
  const pageObjective = page?.objective?.split('{"ox":')[0].trim();
  if (!points.some((point) => matchTitle(point, row))) {
    throw new Error(`Quest ${id} list title or level differs from every map offer`);
  }
  if (page && (page.title !== row.name || page.error
    || !page.url?.includes(`/forever/quest=${id}/`))) {
    throw new Error(`Quest ${id} page text does not match its map and list record`);
  }
  const previous = catalog.quests[id] ?? {};
  const knownNames = new Map([...(previous.rewards ?? []), ...(previous.rewardChoices ?? []),
    ...(previous.rewardItems ?? [])].map((item) => [item.id, item.name]));
  const rewardChoices = itemRows(record, row.itemchoices ?? [], knownNames);
  const choiceIds = new Set(rewardChoices.map((item) => item.id));
  // Two source rows list a choice item again as guaranteed. Do not show it twice.
  const rewardItems = itemRows(record, row.itemrewards ?? [], knownNames)
    .filter((item) => !choiceIds.has(item.id));
  if (rewardChoices.length || rewardItems.length) itemRewardQuests++;
  for (const item of [...rewardChoices, ...rewardItems]) if (item.icon) iconPaths.add(item.icon);
  const currencyRewards = (row.currencyrewards ?? []).map(([currencyId, quantity]) => {
    const currency = currencies.get(currencyId);
    if (!currency?.name || !currency.icon) throw new Error(`Unknown currency ${currencyId}`);
    const icon = `data/items/site-icons/${currency.icon.match(/([^/]+)\.jpg$/)?.[1]}.jpg`;
    iconPaths.add(icon);
    return { id: String(currencyId), name: currency.name, quantity, icon };
  });
  if (row.currencychoicerewards?.length) throw new Error(`Unhandled currency choice for quest ${id}`);
  const reputation = (row.reprewards ?? []).map(([factionId, amount]) => {
    const name = factions.get(factionId);
    if (!name) throw new Error(`Unknown faction ${factionId}`);
    return `${name} ${amount >= 0 ? "+" : ""}${amount}`;
  });
  if (reputation.length) reputationQuests++;
  catalog.quests[id] = { ...previous,
    id: String(id), title: previous.title ?? row.name, level: row.level,
    ...(pageObjective ? { objective: pageObjective } : {}),
    ...(page?.description ? { description: page.description } : {}),
    ...(page?.progressText ? { progressText: readablePageText(page.progressText) } : {}),
    ...(page?.completionText ? { completionText: readablePageText(page.completionText) } : {}),
    ...(row.reqlevel > 0 ? { minimumLevel: previous.minimumLevel ?? row.reqlevel } : {}),
    ...(factionBySide[row.side] ? { faction: previous.faction ?? factionBySide[row.side] } : {}),
    ...(rewardChoices.length ? { rewardChoices } : {}),
    ...(row.itemrewards?.length ? { rewardItems } : {}),
    ...(currencyRewards.length ? { currencyRewards } : {}),
    ...(row.xp > 0 ? { experience: previous.experience ?? row.xp } : {}),
    ...(row.money > 0 ? { money: previous.money ?? formatMoney(row.money) } : {}),
    ...(reputation.length ? { reputation: previous.reputation?.length ? previous.reputation : reputation } : {}),
  };
}
for (const path of iconPaths) await access(`public/${path}`);
catalog.allMapQuestCount = offers.size;
catalog.pageTextQuestCount = [...questPages.keys()].filter((id) => offers.has(id)).length;
catalog.detailIndexCapturedAt = "2026-10-15";
await writeFile("public/data/quests/quest-details.json", `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ quests: offers.size, itemRewardQuests, reputationQuests,
  pageTextQuests: [...questPages.keys()].filter((id) => offers.has(id)).length,
  objectiveQuests: [...offers.keys()].filter((id) => !!catalog.quests[id]?.objective).length,
  descriptionQuests: [...offers.keys()].filter((id) => !!catalog.quests[id]?.description).length,
  iconCount: iconPaths.size, catalogTotal: Object.keys(catalog.quests).length }));
