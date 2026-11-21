/** Fill missing quest marker titles from matching game quest IDs or uniform source titles. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("public/data/quests/quest-details.json");
const source = await read("public/data/locales/wow-forever/map-entity-source.json");
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
if (source.version !== 1 || source.keys.length !== source.values.length) {
  throw new Error("Invalid map entity source");
}
const indicesByKey = new Map(source.keys.map((key, index) => [key, index]));
const contextualQuestIds = {
  "1011896": { questId: "32", startsAt: "Senior Surveyor Fizzledowser", endsAt: "Zilzibin Drumlore" },
  "1012001": { questId: "162", startsAt: "Senior Surveyor Fizzledowser", endsAt: "Gracina Spiritmight" },
  "1011964": { questId: "120", startsAt: "Magistrate Solomon",
    endsAt: "General Marcus Jonathan", faction: "Alliance",
    objectiveIncludes: "delivered to General Marcus Jonathan" },
  "1011965": { questId: "121", startsAt: "General Marcus Jonathan",
    endsAt: "Magistrate Solomon", faction: "Alliance",
    objectiveIncludes: "response to Magistrate Solomon" },
  "1013662": { questId: "4267", startsAt: "Shandris Feathermoon", endsAt: "Gracina Spiritmight" },
  "1011982": { questId: "143", startsAt: "Magistrate Solomon", endsAt: "Gryan Stoutmantle",
    objectiveIncludes: "take his written plea to Gryan Stoutmantle" },
  "1011983": { questId: "144", startsAt: "Gryan Stoutmantle", endsAt: "Magistrate Solomon",
    objectiveIncludes: "Return to Magistrate Solomon" },
  "1012784": { questId: "1181", startsAt: "Wharfmaster Lozgil", endsAt: "Baron Revilgaz",
    objectiveIncludes: "Speak with Baron Revilgaz" },
  "1012785": { questId: "1182", startsAt: "Baron Revilgaz", endsAt: "Baron Revilgaz",
    objectiveIncludes: "Bring the Fuel Regulator Blueprints to Baron Revilgaz" },
  "1013065": { questId: "1798", startsAt: "Lago Blackwrench", endsAt: "Strahad Farsan",
    faction: "Alliance", requiredClass: "Warlock" },
  "1013066": { questId: "1798", startsAt: "Gakin the Darkbinder", endsAt: "Strahad Farsan",
    faction: "Alliance", requiredClass: "Warlock" },
  "1013386": { questId: "2996", startsAt: "Gan'rul Bloodeye", endsAt: "Strahad Farsan",
    faction: "Horde", requiredClass: "Warlock" },
  "1013391": { questId: "3001", startsAt: "Carendin Halgar", endsAt: "Strahad Farsan",
    faction: "Horde", requiredClass: "Warlock" },
  "1013540": { questId: "3642", startsAt: "Oglethorpe Obnoticus", endsAt: "Oglethorpe Obnoticus",
    objectiveIncludes: "Oglethrope Obnoticus" },
  "1013552": { questId: "3763", startsAt: "Innkeeper Saelienne",
    endsAt: "Arch Druid Fandral Staghelm", faction: "Alliance" },
  "1013561": { questId: "3789", startsAt: "Innkeeper Allison",
    endsAt: "Arch Druid Fandral Staghelm", faction: "Alliance" },
  "1013562": { questId: "3790", startsAt: "Innkeeper Firebrew",
    endsAt: "Arch Druid Fandral Staghelm", faction: "Alliance" },
  "1013910": { questId: "5219", startsAt: "High Priestess MacDonnell", endsAt: "Scourge Cauldron",
    precedingQuestId: "5215", objectiveIncludes: "Dalson's Tears" },
  "1013922": { questId: "5231", startsAt: "Shadow Priestess Vandis", endsAt: "Scourge Cauldron",
    precedingQuestId: "5228", objectiveIncludes: "Dalson's Tears" },
  "1013956": { questId: "5342", startsAt: "Alexi Barov", endsAt: "Alexi Barov",
    faction: "Horde", objectiveIncludes: "return to Alexi Barov" },
  "1013958": { questId: "5344", startsAt: "Weldon Barov", endsAt: "Weldon Barov",
    faction: "Alliance", objectiveIncludes: "return to Weldon Barov" },
  "1013966": { questId: "5402", startsAt: "Argent Officer Pureheart",
    endsAt: "Argent Officer Pureheart", faction: "Alliance" },
  "1013967": { questId: "5403", startsAt: "Argent Officer Pureheart",
    endsAt: "Argent Officer Pureheart", faction: "Alliance" },
  "1013968": { questId: "5404", startsAt: "Argent Officer Pureheart",
    endsAt: "Argent Officer Pureheart", faction: "Alliance" },
  "1013970": { questId: "5406", startsAt: "Argent Officer Garush",
    endsAt: "Argent Officer Garush", faction: "Horde" },
  "1013971": { questId: "5407", startsAt: "Argent Officer Garush",
    endsAt: "Argent Officer Garush", faction: "Horde" },
  "1013972": { questId: "5408", startsAt: "Argent Officer Garush",
    endsAt: "Argent Officer Garush", faction: "Horde" },
  "1013986": { questId: "5508", startsAt: "Duke Nicholas Zverenhoff",
    endsAt: "Duke Nicholas Zverenhoff", faction: "Both" },
  "1013987": { questId: "5509", startsAt: "Duke Nicholas Zverenhoff",
    endsAt: "Duke Nicholas Zverenhoff", faction: "Both" },
  "1013988": { questId: "5510", startsAt: "Duke Nicholas Zverenhoff",
    endsAt: "Duke Nicholas Zverenhoff", faction: "Both" },
  "1012281": { questId: "495", startsAt: "Sharlindra", endsAt: "Melisara",
    objectiveIncludes: "Report to Melisara" },
  "1012299": { questId: "518", startsAt: "Melisara", endsAt: "Melisara",
    objectiveIncludes: "Kill 14 Crushridge Maulers" },
  "1012782": { questId: "1179", startsAt: "Pilot Longbeard", endsAt: "Wizzle Brassbolts",
    faction: "Alliance", objectiveIncludes: "crate of crash helmets" },
  "1013273": { questId: "2769", startsAt: "Klockmort Spannerspan", endsAt: "Wizzle Brassbolts",
    faction: "Alliance", objectiveIncludes: "Speak with Wizzle Brassbolts" },
  "1013470": { questId: "3385", startsAt: "Nilith Lokrav", endsAt: "Nilith Lokrav",
    faction: "Both", requiredProfession: "Tailoring (230)", objectiveIncludes: "return it to Nilith" },
  "1013709": { questId: "4493", startsAt: "Gracina Spiritmight",
    endsAt: "Alchemist Pestlezugg", faction: "Alliance",
    completionIncludes: "Gracina sent you" },
  "1013710": { questId: "4494", startsAt: "Zilzibin Drumlore",
    endsAt: "Alchemist Pestlezugg", faction: "Horde",
    completionIncludes: "Zilzibin sent you" },
  "1013616": { questId: "4107", startsAt: "Arathandris Silversky",
    endsAt: "Arathandris Silversky", faction: "Alliance", requiredProfession: "Enchanting (200)", rewardItemId: "11516" },
  "1013621": { questId: "4112", startsAt: "Maybess Riverbreeze",
    endsAt: "Maybess Riverbreeze", faction: "Horde", requiredProfession: "Enchanting (200)", rewardItemId: "11516" },
  "1014095": { questId: "5886", startsAt: "Arathandris Silversky",
    endsAt: "Arathandris Silversky", faction: "Alliance", requiredProfession: "Enchanting (200)", rewardItemId: "11516" },
  "1014100": { questId: "5891", startsAt: "Maybess Riverbreeze",
    endsAt: "Maybess Riverbreeze", faction: "Horde", requiredProfession: "Enchanting (200)", rewardItemId: "11516" },
  "1014273": { questId: "6622", startsAt: "Doctor Gregory Victor",
    endsAt: "Doctor Gregory Victor", faction: "Horde", requiredProfession: "First Aid (225)" },
  "1014275": { questId: "6624", startsAt: "Doctor Gustaf VanHowzen",
    endsAt: "Doctor Gustaf VanHowzen", faction: "Alliance", requiredProfession: "First Aid (225)" },
  "1014316": { questId: "7163", startsAt: "Warmaster Laggrond",
    endsAt: "Warmaster Laggrond", faction: "Horde" },
  "1014321": { questId: "7168", startsAt: "Lieutenant Haggerdin",
    endsAt: "Lieutenant Haggerdin", faction: "Alliance" },
  "1014395": { questId: "7666", startsAt: "Lord Grayson Shadowbreaker",
    endsAt: "Lord Grayson Shadowbreaker", faction: "Alliance", requiredClass: "Paladin" },
  "1014397": { questId: "7669", startsAt: "Sagorne Creststrider",
    endsAt: "Sagorne Creststrider", faction: "Horde", requiredClass: "Shaman" },
  "1014986": { questId: "8929", startsAt: "Deliana",
    endsAt: "Anthion Harmon", faction: "Alliance" },
  "1014987": { questId: "8930", startsAt: "Mokvar",
    endsAt: "Anthion Harmon", faction: "Horde" },
};
for (let offset = 0; offset < 10; offset += 1) {
  const markerId = String(1014951 + offset);
  const npc = offset < 5 ? "Field Marshal Snowfall" : "Warlord Gorchuk";
  contextualQuestIds[markerId] = {
    questId: String(8846 + offset), startsAt: npc, endsAt: npc,
    faction: offset < 5 ? "Alliance" : "Horde",
  };
}
for (const [markerId, context] of Object.entries(contextualQuestIds)) {
  const marker = english.map.questMarkers[markerId];
  const quest = catalog.quests[context.questId];
  if (!marker || marker.startsAt !== context.startsAt || marker.endsAt !== context.endsAt ||
    !quest || quest.title !== marker.name ||
    (context.requiredClass && marker.requiredClass !== context.requiredClass) ||
    (context.requiredProfession && marker.requiredProfession !== context.requiredProfession) ||
    (context.faction && quest.faction !== context.faction) ||
    (context.rewardItemId && !quest.rewardItems?.some((item) => item.id === context.rewardItemId)) ||
    (context.faction && context.objectiveIncludes &&
      !quest.objective?.includes(context.objectiveIncludes)) ||
    (context.completionIncludes && !quest.completionText?.includes(context.completionIncludes)) ||
    (!context.faction && !quest.objective?.includes(context.objectiveIncludes ?? context.endsAt)) ||
    (context.precedingQuestId &&
      (catalog.quests[context.precedingQuestId]?.faction !== quest.faction ||
        !catalog.quests[context.precedingQuestId]?.objective?.includes(context.startsAt))) ||
    source.values[indicesByKey.get(`Quest:${context.questId}:0`)] !== marker.name) {
    throw new Error(`${markerId}: contextual quest identity changed`);
  }
}
const questIndicesByTitle = new Map();
const questIndicesByFoldedTitle = new Map();
for (let index = 0; index < source.keys.length; index += 1) {
  if (!source.keys[index].startsWith("Quest:")) continue;
  const title = source.values[index];
  const indices = questIndicesByTitle.get(title) ?? [];
  indices.push(index);
  questIndicesByTitle.set(title, indices);
  const folded = title.toLocaleLowerCase("en-US");
  const foldedIndices = questIndicesByFoldedTitle.get(folded) ?? [];
  foldedIndices.push(index);
  questIndicesByFoldedTitle.set(folded, foldedIndices);
}
const check = process.argv.includes("--check");
for (const [language, locale] of Object.entries(languages)) {
  const file = `src/i18n/locales/${language}.json`;
  const raw = await readFile(join(root, file), "utf8");
  const target = JSON.parse(raw);
  const translated = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
  if (translated.version !== 1 || translated.values.length !== source.keys.length) {
    throw new Error(`${language}: invalid map entity pack`);
  }
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    if (target.map.questMarkers[id]?.name) continue;
    const questId = contextualQuestIds[id]?.questId ?? catalog.markerQuestIds[`mapgenie-quest-${id}`];
    const exactIndex = indicesByKey.get(`Quest:${questId}:0`);
    let value = exactIndex !== undefined && source.values[exactIndex] === marker.name
      ? translated.values[exactIndex] : null;
    if (!value && marker.endsAt) {
      const candidates = (questIndicesByTitle.get(marker.name) ?? []).filter((index) => {
        const candidateId = source.keys[index].split(":")[1];
        return catalog.quests[candidateId]?.objective?.includes(marker.endsAt);
      });
      if (candidates.length && candidates.every((index) => translated.values[index]
        && translated.values[index] === translated.values[candidates[0]])) {
        value = translated.values[candidates[0]];
      }
    }
    if (!value) {
      const indices = questIndicesByTitle.get(marker.name);
      if (indices?.length && indices.every((index) => translated.values[index]
        && translated.values[index] === translated.values[indices[0]])) {
        value = translated.values[indices[0]];
      }
    }
    if (!value) {
      const indices = questIndicesByFoldedTitle.get(marker.name.toLocaleLowerCase("en-US"));
      if (indices?.length && indices.every((index) => translated.values[index]
        && translated.values[index] === translated.values[indices[0]])) {
        value = translated.values[indices[0]];
      }
    }
    if (!value || value === marker.name) continue;
    (target.map.questMarkers[id] ??= {}).name = value;
    added += 1;
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: map entity marker titles are stale`);
  } else if (output !== raw) await writeFile(join(root, file), output);
  console.log(`${language}: ${added} quest marker titles added`);
}
