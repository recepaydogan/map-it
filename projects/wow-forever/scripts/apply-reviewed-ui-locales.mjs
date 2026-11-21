/** Merge reviewed app prose into the staged locale files without replacing client names. */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "data/app-localization");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const source = JSON.parse(await readFile(join(root, "public/data/locales/wow-forever/source.json"), "utf8"));
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const namedGameTermIndices = new Map();
for (const [index, key] of source.keys.entries()) {
  const table = key.split(":")[0];
  if (table !== "SpellName" && table !== "SkillLine") continue;
  const name = source.values[index];
  const lookup = table + ":" + name;
  const indices = namedGameTermIndices.get(lookup) ?? [];
  indices.push(index);
  namedGameTermIndices.set(lookup, indices);
}
const gameLocaleCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const checked = process.argv.includes("--check");
const catalogs = await Promise.all((await readdir(directory))
  .filter((file) => file.endsWith(".json") && file !== "esmx-regional-map-fallback.json")
  .sort().map(async (file) => [file, JSON.parse(await readFile(join(directory, file), "utf8"))]));
const variables = (value) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1]).sort();

function resolveGameTerms(value, original, pack, language, key) {
  const explicit = value.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g, (_, sourceKey, label) => {
    const index = sourceIndices.get(sourceKey);
    if (index === undefined || source.values[index] !== label || !original.includes(label) ||
      !pack.values[index]) {
      throw new Error(`${language}/${key}: unavailable client term ${sourceKey}`);
    }
    return pack.values[index];
  });
  return explicit.replace(/\{\{(SPELL|SPEC):([^}]+)\}\}/g, (_, kind, label) => {
    const table = kind === "SPELL" ? "SpellName" : "SkillLine";
    const indices = namedGameTermIndices.get(table + ":" + label) ?? [];
    const values = [...new Set(indices.map((index) => pack.values[index]).filter(Boolean))];
    if (!original.includes(label) || values.length !== 1) {
      throw new Error(language + "/" + key + ": ambiguous or unavailable " + table + " term " + label);
    }
    return values[0];
  });
}

function apply(target, translated, language, file, pack, path = []) {
  let count = 0;
  for (const [key, value] of Object.entries(translated)) {
    const next = [...path, key];
    const original = next.reduce((node, part) => node?.[part], english);
    if (typeof value === "string") {
      if (typeof original !== "string") throw new Error(`${file}: unknown source key ${next.join(".")}`);
      const resolved = resolveGameTerms(value, original, pack, language, next.join("."));
      if (JSON.stringify(variables(resolved)) !== JSON.stringify(variables(original))) {
        throw new Error(`${file}: interpolation changed for ${language}/${next.join(".")}`);
      }
      target[key] = resolved;
      count += 1;
    } else if (value && typeof value === "object") {
      if (!original || typeof original !== "object" || Array.isArray(original) !== Array.isArray(value)) {
        throw new Error(`${file}: unknown source group ${next.join(".")}`);
      }
      if (target[key] == null || Array.isArray(target[key]) !== Array.isArray(value)) {
        target[key] = Array.isArray(value) ? [] : {};
      }
      count += apply(target[key], value, language, file, pack, next);
    } else {
      throw new Error(`${file}: invalid translation ${language}/${next.join(".")}`);
    }
  }
  return count;
}

const pendingWrites = [];
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const target = JSON.parse(await readFile(path, "utf8"));
  const pack = JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/${gameLocaleCodes[language]}.json`), "utf8"));
  let count = 0;
  for (const [file, catalog] of catalogs) {
    if (Object.keys(catalog).some((code) => !languages.includes(code)) || !catalog[language]) {
      throw new Error(`${file}: incomplete or unknown language set`);
    }
    count += apply(target, catalog[language], language, file, pack);
  }
  const result = JSON.stringify(target, null, 2) + "\n";
  if (checked) {
    if (result !== await readFile(path, "utf8")) throw new Error(`${language}: reviewed UI locale is stale`);
  } else pendingWrites.push([path, result]);
  console.log(`${language}: ${count} reviewed UI strings`);
}
for (const [path, result] of pendingWrites) await writeFile(path, result);
