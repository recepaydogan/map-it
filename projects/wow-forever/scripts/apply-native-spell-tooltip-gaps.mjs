/** Fill exact same-ID rank and Classic description gaps from Blizzard build 70790. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const nativeDir = "data/site-research/wowhead-check-2026-11-04/localization";
const english = await read(`${nativeDir}/native-enUS.json`);
if (english.build !== 70790 || english.locale !== "enUS") {
  throw new Error("Unexpected English client build");
}
const details = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const sources = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, {
    native: await read(`${nativeDir}/native-${locale}.json`),
    pack: await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`),
  }])));
let additions = 0;
const counts = { r: 0, old: 0 };
for (const locale of locales) {
  const { native, pack } = sources[locale];
  if (native.build !== english.build || native.locale !== locale ||
    pack.locale !== locale || pack.version !== 1) {
    throw new Error(`${locale}: client build or locale pack mismatch`);
  }
  for (const [id, detail] of Object.entries(details)) {
    const source = english.spells[id];
    const translated = native.spells[id];
    if (!source || !translated || source.name !== detail.n ||
      !Array.isArray(source.fields) || !Array.isArray(translated.fields)) continue;
    for (const field of ["r", "old"]) {
      if (!detail[field] || (field === "old" && detail.old === detail.d) ||
        pack.entries[id]?.[field]) continue;
      const index = field === "r" ? 0 : 1;
      const englishTemplate = source.fields[index];
      const localizedTemplate = translated.fields[index];
      if (!englishTemplate || !localizedTemplate ||
        englishTemplate === localizedTemplate) continue;
      const variables = field === "r"
        ? (englishTemplate === detail.r ? {} : undefined)
        : matchLinkedSpellTemplate(englishTemplate, detail.old);
      if (variables === undefined) continue;
      const value = field === "r" ? localizedTemplate :
        renderResolvedSpellTemplate(localizedTemplate, variables, locale, detail.old);
      if (!value || value === detail[field] ||
        /\$[A-Za-z0-9{]/.test(value) ||
        numbers(value) !== numbers(detail[field]) ||
        hasEastAsianEnglishCarryover(value, locale)) continue;
      (pack.entries[id] ??= {})[field] = value;
      additions++;
      counts[field]++;
    }
  }
}
if (check && additions) {
  throw new Error(`${additions} exact native tooltip fields are missing`);
}
if (!check) {
  for (const locale of locales) {
    const path = join(root, `public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    const original = await readFile(path, "utf8");
    const output = JSON.stringify(sources[locale].pack) +
      (original.endsWith("\n") ? "\n" : "");
    if (output === original) continue;
    for (let attempt = 0; attempt < 8; attempt++) {
      try { await writeFile(path, output); break; }
      catch (error) {
        if (!["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(error.code) ||
          attempt === 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
}
console.log(`${additions} native tooltip fields: ranks=${counts.r}, Classic descriptions=${counts.old}`);
