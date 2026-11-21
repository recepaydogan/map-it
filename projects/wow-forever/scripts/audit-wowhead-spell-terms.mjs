/** Flag Wowhead tooltips that use another locale's client spell name. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const gameSource = await read("public/data/locales/wow-forever/source.json");
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/${locale}.json`)])));
const fold = (value) => value.normalize("NFKC").toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const containsName = (text, name, locale) => /^(?:koKR|zhCN|zhTW)$/.test(locale)
  ? fold(text).replace(/ /g, "").includes(fold(name).replace(/ /g, ""))
  : ` ${fold(text)} `.includes(` ${fold(name)} `);
const terms = new Map();
for (let index = 0; index < gameSource.keys.length; index += 1) {
  if (!gameSource.keys[index].startsWith("SpellName:")) continue;
  const english = gameSource.values[index];
  if (english.length < 8 || !english.includes(" ")) continue;
  const names = terms.get(english) ?? Object.fromEntries(locales.map((locale) =>
    [locale, new Set()]));
  for (const locale of locales) {
    const localized = packs[locale].values[index];
    if (localized && localized !== english) names[locale].add(localized);
  }
  terms.set(english, names);
}
const sourceContainsTerm = (source, term) => {
  const index = source.indexOf(term);
  if (index < 0) return false;
  const before = source[index - 1] ?? "";
  const after = source[index + term.length] ?? "";
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
};
const sources = [
  ["d", await read("data/site-research/wowhead-spell-candidates.json")],
  ["a", await read("data/site-research/wowhead-aura-candidates.json")],
  ["old", await read("data/site-research/wowhead-classic-spell-candidates.json")],
];
const sourceTerms = new Map();
for (const [, report] of sources) {
  for (const { source } of report.candidates) {
    if (sourceTerms.has(source)) continue;
    sourceTerms.set(source, [...terms.entries()].filter(([term]) =>
      sourceContainsTerm(source, term)));
  }
}
const reviewed = {
  d: (await read("data/spell-tooltip-localization/reviewed-overrides.json")).spells,
  a: (await read("data/spell-tooltip-localization/reviewed-aura-spells.json")).spells,
  old: (await read("data/spell-tooltip-localization/reviewed-classic-overrides.json")).spells,
};
const flags = [];
for (const [field, report] of sources) {
  for (const candidate of report.candidates) {
    const { id, locale, source, translation } = candidate;
    for (const [term, names] of sourceTerms.get(source) ?? []) {
      const expected = [...names[locale]].filter((name) => fold(name).length >= 8);
      if (!expected.length || expected.some((name) =>
        containsName(translation, name, locale))) continue;
      const other = Object.entries(names).filter(([otherLocale]) => otherLocale !== locale)
        .flatMap(([otherLocale, values]) => [...values].filter((name) =>
          fold(name).length >= 8 && !expected.some((item) => fold(item) === fold(name)) &&
          containsName(translation, name, locale)).map((name) => ({ locale: otherLocale, name })));
      if (!other.length) continue;
      flags.push({ id, field, locale, term, expected,
        foundOtherNames: [...new Map(other.map((entry) =>
          [`${entry.locale}:${entry.name}`, entry])).values()],
        reviewed: reviewed[field][id]?.locales[locale] === translation });
    }
  }
}
await writeFile(join(root, "data/site-research/wowhead-spell-term-review-flags.json"),
  `${JSON.stringify({ version: 1, sources: sourceTerms.size, flags }, null, 2)}\n`);
console.log(`${sourceTerms.size} tooltip source texts scanned; ${flags.length} cross-locale spell-name flags; ${flags.filter((flag) => flag.reviewed).length} already reviewed.`);
