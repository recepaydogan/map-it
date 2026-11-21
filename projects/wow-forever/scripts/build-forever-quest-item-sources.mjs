/** Link verified item rewards to exact Forever All world-map quest IDs. */
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const details = await readJson("public/data/quests/quest-details.json");
const items = await readJson("public/data/items/catalog.json");
const enrichment = await readJson("public/data/items/foreverdb-enrichment.json");
const markers = await readJson("public/maps/world-atlas/locations-forever-all-quests.json");
if (enrichment.version !== 2 || !Array.isArray(enrichment.newItems)) {
  throw new Error("Invalid item enrichment");
}
const itemById = new Map([...items.items.map((item) => ({ ...item,
  name: enrichment.entries[item.id]?.current?.name ?? item.name })),
...enrichment.newItems].map((item) => [item.id, item]));
const markersByQuest = new Map();
for (const marker of markers.locations) {
  if (!marker.questId) continue;
  const group = markersByQuest.get(marker.questId) ?? [];
  group.push(marker);
  markersByQuest.set(marker.questId, group);
}
if (markersByQuest.size !== details.allMapQuestCount) {
  throw new Error("All quest marker coverage changed");
}

const sources = {};
let rewardCount = 0;
let unavailableItems = 0;
let conflictingNames = 0;
for (const [questId, questMarkers] of markersByQuest) {
  const detail = details.quests[questId];
  if (!detail || questMarkers.some((marker) => marker.questLevel !== detail.level)) {
    throw new Error(`Missing or conflicting quest ${questId}`);
  }
  const rewardGroups = new Map();
  if (detail.rewardChoices?.length || detail.rewardItems?.length) {
    for (const item of detail.rewardChoices ?? []) rewardGroups.set(item.id, { item, choice: true });
    for (const item of detail.rewardItems ?? []) rewardGroups.set(item.id, { item, choice: false });
  } else {
    for (const item of detail.rewards ?? []) {
      rewardGroups.set(item.id, { item, choice: Boolean(detail.rewardChoice) });
    }
  }
  for (const { item, choice } of rewardGroups.values()) {
    const known = itemById.get(item.id);
    if (!known || !item.name) {
      unavailableItems++;
      continue;
    }
    if (known.name !== item.name) {
      conflictingNames++;
      continue;
    }
    const quantity = item.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid reward count in quest ${questId}`);
    }
    const marker = questMarkers[0];
    const rows = sources[item.id] ?? [];
    rows.push({
      questId, name: detail.title, level: detail.level,
      giver: marker.questGiverName, region: marker.region, markerId: marker.id,
      quantity,
      ...(detail.faction ? { faction: detail.faction } : {}),
      ...(choice ? { choice: true } : {}),
      ...(detail.objectiveItem ? { requiredItem: `${detail.objectiveItem.name} ×${detail.objectiveItem.quantity}` } : {}),
    });
    sources[item.id] = rows;
    rewardCount++;
  }
}

const output = "public/data/items/forever-quest-rewards.json";
const content = `${JSON.stringify({ version: 1, items: Object.fromEntries(Object.entries(sources)
  .sort(([a], [b]) => Number(a) - Number(b)).map(([id, rows]) => [id,
    rows.sort((a, b) => Number(a.questId) - Number(b.questId))])) }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== content) throw new Error("Forever quest item sources are out of date");
} else {
  await writeFile(output, content);
}
console.log(JSON.stringify({ rewardCount, itemCount: Object.keys(sources).length,
  unavailableItems, conflictingNames }));
