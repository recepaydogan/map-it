/** Merge reviewed map explanations, preserving interpolation and quest markup. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalogDirectory = join(root, "data/map-context-localization");
const catalogs = await Promise.all((await readdir(catalogDirectory))
  .filter((name) => name.endsWith(".json") && name !== "quest-source-notes.json")
  .sort().map(async (name) => read(`data/map-context-localization/${name}`)));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const tokens = (text) => [...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1]).sort();
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  let count = 0;
  for (const catalog of catalogs) {
    const data = catalog[language] ?? (language === "es-MX" ? catalog.es : undefined);
    if (!data) throw new Error(`Missing reviewed map text: ${language}`);
    for (const [group, values] of Object.entries(data)) {
      const original = english.map[group];
      if (!original || Object.keys(values).some((key) => typeof original[key] !== "string"))
        throw new Error(`${language}: unknown map text in ${group}`);
      locale.map[group] ??= {};
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== "string" || JSON.stringify(tokens(value)) !== JSON.stringify(tokens(original[key]))
          || (original[key].includes("<quest>") && !value.includes("<quest>"))) {
          throw new Error(`${language}: invalid map text ${group}.${key}`);
        }
        locale.map[group][key] = value;
        count += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: map context text is stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${count} map explanations`);
}
