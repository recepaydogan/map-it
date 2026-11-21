/** Find unchanged guide name lists that have reviewed game-name translations. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const sources = await Promise.all([
  read("data/quest-title-localization/pfquest-classic-titles.json"),
  read("data/quest-title-localization/polestar-forever-titles.json"),
  read("data/quest-title-localization/polestar-forever-partial-titles.json"),
  read("data/npc-name-localization/pfquest-classic-names.json"),
  read("data/npc-name-localization/polestar-forever-names.json"),
  read("data/npc-name-localization/map-seeded-forever-names.json"),
  read("data/guide-localization/reviewed-invariant-game-names.json"),
]);
const names = new Map();
for (const source of sources) for (const [english, record] of Object.entries(source.titles ?? source.names)) {
  const existing = names.get(english) ?? {};
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    if (record[language] && !existing[language]) existing[language] = record[language];
  }
  names.set(english, existing);
}
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const guideIds = (await read("public/data/guides/index.json")).guides.map((guide) => guide.id);
const blocks = (html) => [...html.matchAll(/<(p|li|td|th|h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
  .map((match) => match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
  .filter((value) => value.length >= 25);
for (const language of languages) {
  let covered = 0;
  for (const id of guideIds) {
    const original = new Set(blocks((await read(`public/data/guides/${id}.json`)).html));
    const target = await read(`public/data/guides/locales/${language}/${id}.json`);
    for (const text of blocks(target.html)) {
      if (!original.has(text)) continue;
      const parts = text.split(/,\s*/);
      const translated = parts.map((part) => names.get(part)?.[language]);
      if (parts.length < 2 || !translated.every(Boolean)) continue;
      covered += 1;
      console.log(`${language}\t${id}\t${target.html.includes(`>${text}<`) ? "plain" : "markup"}\t${text}\t${translated.join(", ")}`);
    }
  }
  console.log(`${language}: ${covered} fully covered unchanged game-name lists`);
}

// Bare-list checks miss game names embedded in translated prose and table cells.
// Compare visible text with the English guide, then verify the few identical
// client spell/area names that are intentionally English in their own locale.
const clientSource = await read("public/data/locales/wow-forever/source.json");
const clientIndex = new Map(clientSource.keys.map((key, index) => [key, index]));
const clientCodes = { de: "deDE", fr: "frFR" };
const clientPacks = new Map(await Promise.all(Object.entries(clientCodes).map(async ([language, code]) =>
  [language, await read(`public/data/locales/wow-forever/${code}.json`)])));
const reviewedClientNames = {
  "de/leveling/Moonglade": { key: "SpellName:18960:0", value: "Teleportieren: Moonglade" },
  "de/leveling/Southshore": { key: "AreaTable:271:1", value: "Southshore" },
  "de/leveling-druid/Moonglade": { key: "AreaTable:493:1", value: "Moonglade" },
  "fr/leveling-warlock/Corruption": { key: "SpellName:172:0", value: "Corruption" },
};
const visibleText = (html) => html.replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsName = (text, name) => new RegExp(
  `(^|[^\\p{L}\\p{N}])${escapeRegex(name)}(?=$|[^\\p{L}\\p{N}'’])`, "u").test(text);
let embeddedLeftovers = 0;
for (const language of languages) {
  for (const id of guideIds) {
    const original = visibleText((await read(`public/data/guides/${id}.json`)).html);
    const localized = visibleText((await read(`public/data/guides/locales/${language}/${id}.json`)).html);
    for (const [name, byLanguage] of names) {
      const translated = byLanguage[language];
      if (name.length < 5 || !translated || translated === name ||
        !original.includes(name) || !localized.includes(name) ||
        !containsName(original, name) || !containsName(localized, name)) continue;
      const review = reviewedClientNames[`${language}/${id}/${name}`];
      if (review) {
        const index = clientIndex.get(review.key);
        if (index === undefined || clientPacks.get(language)?.values[index] !== review.value ||
          !clientSource.values[index].includes(name)) {
          throw new Error(`Reviewed client name changed: ${language}/${id}/${name}`);
        }
        continue;
      }
      embeddedLeftovers += 1;
      console.log(`${language}/${id}: possible embedded English game name ${name} -> ${translated}`);
    }
  }
}
console.log(`Possible embedded English game names requiring review: ${embeddedLeftovers}`);
if (embeddedLeftovers) process.exitCode = 1;
