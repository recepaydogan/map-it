/** Extract item effect text from saved localized Wowhead tooltips. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHtml, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const catalog = JSON.parse(await read("public/data/items/catalog.json"));
const captures = new Map();
for (const line of (await read("data/site-research/wowhead-item-locale-captures.jsonl"))
  .split(/\r?\n/)) {
  if (!line) continue;
  const record = JSON.parse(line);
  captures.set(`${record.id}:${record.locale}`, record);
}
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const plain = (html) => decodeHtml(html.replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, ""))
  .replace(/\u00a0/g, " ").trim();
const effects = (capture) => [...(capture?.tooltip ?? "")
  .matchAll(/<span id="useText\d+" class="q2">([\s\S]*?)<\/span>/g)]
  .map((match) => {
    const link = /<a\b[^>]*class="q2"[^>]*>([\s\S]*?)<\/a>/.exec(match[1]);
    return link ? plain(link[1]) : null;
  });
const flavors = (capture) => [...(capture?.tooltip ?? "")
  .matchAll(/<span class="q">([\s\S]*?)<\/span>/g)]
  .map((match) => plain(match[1]));
const candidates = [];
const descriptions = [];
const unmatched = [];
const counts = { itemIds: 0, sourceMatchedEffects: 0, translatedLocales: 0,
  unchangedLocales: 0, sourceDriftEffects: 0, sourceUnmatchedEffects: 0,
  descriptionIds: 0, descriptionLocales: 0 };
for (const item of catalog.items) {
  if (!item.siteEffects?.length && !item.description) continue;
  const english = captures.get(`${item.id}:en`);
  if (!english) continue;
  const localized = Object.fromEntries(Object.entries(locales).map(
    ([short, locale]) => [locale, captures.get(`${item.id}:${short}`)]));
  if (item.description) {
    const englishFlavors = flavors(english);
    const exact = englishFlavors.findIndex((text) => sameWords(text, item.description));
    const index = exact >= 0 ? exact : englishFlavors.length === 1 ? 0 : -1;
    if (index >= 0) {
      const translations = {};
      const evidence = {};
      for (const [locale, record] of Object.entries(localized)) {
        const value = flavors(record)[index];
        if (!value || sameWords(value, englishFlavors[index])) continue;
        translations[locale] = value;
        evidence[locale] = record.url;
        counts.descriptionLocales++;
      }
      if (Object.keys(translations).length) {
        counts.descriptionIds++;
        descriptions.push({ id: Number(item.id), source: item.description,
          wowheadEnglish: englishFlavors[index], sourceMatches: exact >= 0,
          translations, evidence });
      }
    }
  }
  if (!item.siteEffects?.length) continue;
  const englishEffects = effects(english);
  const rows = [];
  for (const [position, effect] of item.siteEffects.entries()) {
    const exact = englishEffects.findIndex((text) => text && sameWords(text, effect.text));
    const index = exact >= 0 ? exact : englishEffects[position] ? position : -1;
    if (index < 0) {
      counts.sourceUnmatchedEffects++;
      unmatched.push({ id: Number(item.id), source: effect.text,
        wowheadEnglishEffects: englishEffects });
      continue;
    }
    if (exact >= 0) counts.sourceMatchedEffects++;
    else counts.sourceDriftEffects++;
    const translations = {};
    const evidence = {};
    for (const [locale, record] of Object.entries(localized)) {
      const value = effects(record)[index];
      if (!value) continue;
      if (sameWords(value, englishEffects[index])) counts.unchangedLocales++;
      else {
        translations[locale] = value;
        evidence[locale] = record.url;
        counts.translatedLocales++;
      }
    }
    if (Object.keys(translations).length) rows.push({ position, kind: effect.kind,
      source: effect.text, wowheadEnglish: englishEffects[index],
      sourceMatches: exact >= 0, translations, evidence });
  }
  if (rows.length) {
    counts.itemIds++;
    candidates.push({ id: Number(item.id), sourceName: item.name, effects: rows });
  }
}
await writeFile(join(root, "data/site-research/wowhead-item-effect-candidates.json"),
  `${JSON.stringify({ version: 1, counts, candidates, descriptions, unmatched }, null, 2)}\n`);
console.log(JSON.stringify(counts));
