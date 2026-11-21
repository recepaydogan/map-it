import { readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const detailsPath = "public/data/quests/quest-details.json";
const [details, atlas, locale, observed, itemCatalog, itemEnrichment, foreverNewQuests] = await Promise.all([
  readJson(detailsPath),
  readJson("public/maps/world-atlas/locations-quests.json"),
  readJson("src/i18n/locales/en.json"),
  readJson("public/data/dungeons/observed-quests.json"),
  readJson("public/data/items/catalog.json"),
  readJson("public/data/items/foreverdb-enrichment.json"),
  readJson("public/data/quests/world-map-new-quests.json"),
]);

const normalize = (value) => (value ?? "").toLowerCase().replace(/[’]/g, "'").trim();
const markers = atlas.locations.filter((point) => ["quest", "repeatable-quest"].includes(point.category))
  .map((point) => ({
    point,
    text: locale.map.questMarkers[point.id.split("-").at(-1)] ?? {},
  }));

function candidatesFor(quest) {
  const titled = markers.filter(({ point, text }) => normalize(text.name) === normalize(quest.title)
    && (quest.minimumLevel === undefined || point.questInfo?.requiredLevel === undefined
      || point.questInfo.requiredLevel === quest.minimumLevel));
  const giver = quest.giver?.name ?? quest.startsAt;
  const turnIn = quest.turnIn?.name ?? quest.endsAt;
  const knownNpc = (name) => name && !/^Creature #\d+$/i.test(name);
  const exact = titled.filter(({ text }) => (!knownNpc(giver) || normalize(text.startsAt) === normalize(giver))
    && (!knownNpc(turnIn) || normalize(text.endsAt) === normalize(turnIn)));
  return { matches: exact.length ? exact : [], titled };
}

const markerQuestIds = { ...details.markerQuestIds };
const foreverNewQuestIds = new Set(foreverNewQuests.quests.map((quest) => quest.id));
const existingMarkerQuestIds = new Set(Object.values(details.markerQuestIds));
const markerDungeonQuests = {};
const ambiguous = [];

for (const quest of Object.values(details.quests)) {
  // The All map index adds thousands of same-title quest stages without legacy
  // Mapgenie links. Only previously linked or independently observed quests can
  // establish a link from a legacy marker's title and giver text.
  if (!quest.evidence && !existingMarkerQuestIds.has(quest.id)) continue;
  // New world-map quests have their own ID-linked giver pins. A shared title alone
  // cannot identify a separate legacy Mapgenie marker for another quest stage.
  if (foreverNewQuestIds.has(quest.id) && !existingMarkerQuestIds.has(quest.id)) continue;
  const { matches, titled } = candidatesFor(quest);
  if (matches.length === 1) {
    const markerId = matches[0].point.id;
    if (markerQuestIds[markerId] && markerQuestIds[markerId] !== quest.id) {
      throw new Error(`Conflicting quest IDs for ${markerId}: ${markerQuestIds[markerId]} and ${quest.id}`);
    }
    markerQuestIds[markerId] = quest.id;
  } else if (quest.rewards?.length && titled.length > 1) {
    ambiguous.push(`Catalog ${quest.id} ${quest.title}: ${titled.map(({ point }) => point.id).join(", ")}`);
  }
}

for (const quest of observed.quests) {
  const { matches, titled } = candidatesFor(quest);
  if (matches.length === 1 && quest.dungeonId) {
    const markerId = matches[0].point.id;
    if (markerDungeonQuests[markerId]?.id !== undefined) {
      throw new Error(`Conflicting observed quests for ${markerId}`);
    }
    markerDungeonQuests[markerId] = { dungeonId: quest.dungeonId, id: quest.id };
  } else if (titled.length > 1) {
    ambiguous.push(`Observed ${quest.id} ${quest.title}: ${titled.map(({ point }) => point.id).join(", ")}`);
  }
}

const itemIds = new Set([...itemCatalog.items, ...itemEnrichment.newItems].map((item) => item.id));
const observedById = new Map(observed.quests.map((quest) => [quest.id, quest]));
const markerById = new Map(markers.map(({ point, text }) => [point.id, text]));
for (const [markerId, link] of Object.entries(markerDungeonQuests)) {
  const quest = observedById.get(link.id);
  if (!quest || quest.dungeonId !== link.dungeonId) throw new Error(`Invalid dungeon quest link for ${markerId}`);
  for (const item of [...quest.rewardChoices ?? [], ...quest.rewardItems ?? []]) {
    if (!itemIds.has(item.id)) throw new Error(`Reward item ${item.id} is absent from the item catalog`);
  }
}
for (const [markerId, questId] of Object.entries(markerQuestIds)) {
  const quest = details.quests[questId];
  const text = markerById.get(markerId);
  if (!quest || !text || (normalize(quest.title) !== normalize(text.name)
    && !(quest.id === "92516" && text.name === "Hippogryph Harrassment"))) {
    throw new Error(`Invalid catalog quest link for ${markerId}`);
  }
  for (const item of quest.rewards ?? []) {
    if (!itemIds.has(item.id)) throw new Error(`Reward item ${item.id} is absent from the item catalog`);
  }
}

const sortEntries = (record) => Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
const expectedQuestIds = sortEntries(markerQuestIds);
const expectedDungeonQuests = sortEntries(markerDungeonQuests);
const isCheck = process.argv.includes("--check");
if (isCheck) {
  if (JSON.stringify(details.markerQuestIds) !== JSON.stringify(expectedQuestIds)
    || JSON.stringify(details.markerDungeonQuests) !== JSON.stringify(expectedDungeonQuests)) {
    throw new Error("Quest marker links are out of date. Run node scripts/sync-quest-marker-details.mjs.");
  }
} else {
  details.markerQuestIds = expectedQuestIds;
  details.markerDungeonQuests = expectedDungeonQuests;
  await writeFile(detailsPath, `${JSON.stringify(details, null, 2)}\n`);
}

const knownRewardMarkers = new Set([
  ...Object.entries(expectedQuestIds).filter(([, id]) => details.quests[id].rewards?.length).map(([id]) => id),
  ...Object.entries(expectedDungeonQuests).filter(([, link]) => {
    const quest = observedById.get(link.id);
    return quest?.rewardChoices?.length || quest?.rewardItems?.length || quest?.reward
      || quest?.experience || quest?.money || quest?.reputation?.length;
  }).map(([id]) => id),
]);
const observedWithSameTitle = observed.quests.filter((quest) => candidatesFor(quest).titled.length > 0).length;
console.log(`Quest marker links: ${Object.keys(expectedQuestIds).length} catalog; ${Object.keys(expectedDungeonQuests).length}/${observedWithSameTitle} observed dungeon quests with same-title map markers linked by exact stage. ${knownRewardMarkers.size} marker rewards are documented.`);
if (ambiguous.length) console.log(`Unresolved same-name stages (${ambiguous.length}):\n${ambiguous.join("\n")}`);
