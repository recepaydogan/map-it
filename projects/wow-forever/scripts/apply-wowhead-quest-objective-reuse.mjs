/** Reuse a direct Wowhead objective only for an identical English quest objective. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isEnglishQuestProseFallback } from "./lib/wowhead-quest-prose-page.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const source = await read(`${directory}/quest-text-source.json`);
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const fallbacks = (await read(`${directory}/quest-text-app-fallbacks.json`)).locales;
const manual = await read(`${directory}/quest-prose-wowhead.json`);
const codes = { deDE: "de", esES: "es", esMX: "mx", frFR: "fr", koKR: "ko",
  ptBR: "pt", zhCN: "cn", zhTW: "tw" };
const numbers = (value) => new Set((value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
const numbersMatch = (english, localized) =>
  [...numbers(english)].every((number) => numbers(localized).has(number));
const hasProse = (pack, id, locale, english) =>
  pack.quests[id]?.english?.objective === english &&
  Boolean(pack.quests[id]?.locales?.[locale]?.objective) &&
  !isEnglishQuestProseFallback(pack.quests[id].locales[locale].objective, english);

for (const [locale, code] of Object.entries(codes)) {
  const filename = `${directory}/quest-objective-wowhead-${locale}.json`;
  const pack = await read(filename);
  const prose = await read(`${directory}/quest-prose-wowhead-${locale}.json`);
  const client = await read(`${directory}/quest-text-${locale}.json`);
  if (pack.version !== 1 || !pack.quests || client.version !== 1 ||
    client.values.length !== source.keys.length) throw new Error(`Invalid ${locale} quest packs`);
  const byEnglish = new Map();
  for (const [id, entry] of Object.entries(pack.quests)) {
    const english = entry.english?.objective;
    const localized = entry.locales?.[locale]?.objective;
    if (entry.reusedFromQuestId || !english || english !== catalog[id]?.objective ||
      !localized || isEnglishQuestProseFallback(localized, english) ||
      !numbersMatch(english, localized) ||
      entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${id}` ||
      entry.localeUrls?.[locale] !==
        `https://www.wowhead.com/forever/${code}/quest=${id}`) continue;
    const candidates = byEnglish.get(english) ?? [];
    candidates.push({ id, localized, localeUrl: entry.localeUrls[locale] });
    byEnglish.set(english, candidates);
  }
  let added = 0;
  for (const [id, quest] of Object.entries(catalog)) {
    const english = quest.objective;
    if (!english || pack.quests[id] || hasProse(manual, id, locale, english) ||
      hasProse(prose, id, locale, english)) continue;
    const key = `${id}:objective`;
    const index = sourceIndex.get(key);
    const clientText = index !== undefined && source.values[index] === english &&
      (client.values[index] || fallbacks[locale]?.[key]);
    if (clientText && !isEnglishQuestProseFallback(clientText, english) &&
      numbersMatch(english, clientText)) continue;
    const candidates = byEnglish.get(english);
    if (!candidates?.length ||
      new Set(candidates.map((candidate) => candidate.localized)).size !== 1) continue;
    const donor = candidates[0];
    pack.quests[id] = {
      reusedFromQuestId: donor.id,
      sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
      localeUrls: { [locale]: donor.localeUrl },
      english: { objective: english },
      locales: { [locale]: { objective: donor.localized } },
    };
    added++;
  }
  if (process.argv.includes("--check") && added) {
    throw new Error(`${locale}: ${added} reusable objectives missing`);
  }
  if (!process.argv.includes("--check") && !process.argv.includes("--dry-run") && added) {
    await writeFile(join(root, filename), JSON.stringify(pack));
  }
  console.log(`${locale}: ${added} exact-English Wowhead objectives reused`);
}
