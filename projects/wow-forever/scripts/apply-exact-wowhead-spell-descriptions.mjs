/** Add only reviewed, exact-ID and exact-English Wowhead spell descriptions. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";
import { sameClassDescriptionText } from "./lib/wowhead-class-description-captures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const reviewed = await read("data/spell-tooltip-localization/reviewed-wowhead-exact-description-ids.json");
if (reviewed.version !== 1 || !Array.isArray(reviewed.ids) ||
  new Set(reviewed.ids).size !== reviewed.ids.length ||
  reviewed.ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
  throw new Error("Invalid reviewed spell IDs");
}
const captures = new Map();
for (const capturePath of ["data/site-research/wowhead-class-description-gaps.jsonl",
  "data/site-research/wowhead-player-spell-description-gaps.jsonl"]) {
  for (const line of (await readFile(join(root, capturePath), "utf8"))
    .split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    if (reviewed.ids.includes(record.id)) {
      const key = `${record.id}:${record.locale}`;
      if (captures.has(key) && captures.get(key).text !== record.text) {
        throw new Error(`Conflicting Wowhead capture: ${key}`);
      }
      captures.set(key, record);
    }
  }
}
const languages = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
for (const [key, reason] of Object.entries(reviewed.excludedLocales ?? {})) {
  const [id, locale] = key.split(":");
  if (!reviewed.ids.includes(Number(id)) || !Object.values(languages).includes(locale) ||
    typeof reason !== "string" || !reason.trim()) {
    throw new Error(`Invalid excluded locale: ${key}`);
  }
}
const nativeEnglish = await read("data/site-research/wowhead-check-2026-11-04/localization/native-enUS.json");
const nativeChinese = await read("data/site-research/wowhead-check-2026-11-04/localization/native-zhCN.json");
for (const [key, term] of Object.entries(reviewed.termSubstitutions ?? {})) {
  const [id, locale] = key.split(":");
  const source = nativeEnglish.spells?.[term.sourceSpellId];
  const localized = nativeChinese.spells?.[term.sourceSpellId];
  if (!reviewed.ids.includes(Number(id)) || locale !== "zhCN" ||
    nativeEnglish.build !== 70790 || nativeChinese.build !== 70790 ||
    !source?.fields?.some((field) => field.includes(term.englishTerm)) ||
    !localized?.fields?.some((field) => field.includes(term.localizedTerm)) ||
    term.from !== `[${term.englishTerm}]`) {
    throw new Error(`Invalid reviewed client term substitution: ${key}`);
  }
}
const details = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const packs = Object.fromEntries(await Promise.all(Object.values(languages).map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`)])));
let additions = 0;
for (const id of reviewed.ids) {
  const source = details[id];
  const english = captures.get(`${id}:en`);
  const englishUrl = `https://nether.wowhead.com/forever/tooltip/spell/${id}`;
  if (!source?.d || !english || english.url !== englishUrl ||
    english.name !== source.n || !sameClassDescriptionText(english.text, source.d)) {
    throw new Error(`${id}: Wowhead English description does not match the current spell`);
  }
  for (const [code, locale] of Object.entries(languages)) {
    if (reviewed.excludedLocales?.[`${id}:${locale}`]) continue;
    const record = captures.get(`${id}:${code}`);
    const expectedUrl = `https://nether.wowhead.com/forever/${code}/tooltip/spell/${id}`;
    const substitution = reviewed.termSubstitutions?.[`${id}:${locale}`];
    const capturedText = record?.text;
    if (substitution && (typeof capturedText !== "string" ||
      capturedText.split(substitution.from).length !== 2)) {
      throw new Error(`${id}/${locale}: reviewed term occurs unexpectedly`);
    }
    const value = substitution ? capturedText.replace(substitution.from,
      substitution.localizedTerm) : capturedText;
    const numericException = reviewed.numericExceptions?.[`${id}:${locale}`];
    const numericMatch = numbers(value ?? "") === numbers(english.text) ||
      (numericException && english.text.includes(numericException.englishPhrase) &&
        value?.includes(numericException.localizedPhrase) &&
        numbers(value) === numericException.signature);
    if (record?.url !== expectedUrl || typeof value !== "string" ||
      !value.trim() || value === english.text ||
      /\$[A-Za-z0-9{]/.test(value) ||
      !numericMatch ||
      hasEastAsianEnglishCarryover(value, locale)) {
      throw new Error(`${id}/${locale}: unusable localized Wowhead description`);
    }
    const pack = packs[locale];
    if (pack.locale !== locale || pack.version !== 1) throw new Error(`${locale}: invalid pack`);
    const entry = pack.entries[id] ??= {};
    if (entry.d && entry.d !== value) throw new Error(`${id}/${locale}: conflicting description`);
    if (!entry.d) {
      entry.d = value;
      additions++;
    }
  }
}
if (!check) {
  for (const [locale, pack] of Object.entries(packs)) {
    const path = join(root, `public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    const original = await readFile(path, "utf8");
    const output = JSON.stringify(pack) + (original.endsWith("\n") ? "\n" : "");
    if (output !== original) await writeFile(path, output);
  }
} else if (additions) {
  throw new Error(`${additions} reviewed Wowhead descriptions are missing`);
}
console.log(`${reviewed.ids.length} exact spell IDs checked; ${additions} locale descriptions added.`);
