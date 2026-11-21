/** Prefer a reviewed localized client name when the matching map table retains English. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const rows = await read("data/map-context-localization/reviewed-alternate-client-place-names.json");
const flightRows = await read("data/map-context-localization/reviewed-alternate-client-flight-points.json");
const localeIds = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const entityIndices = new Map(entitySource.keys.map((key, index) => [key, index]));
const resolveSource = (key) => key.startsWith("Quest:")
  ? { index: entityIndices.get(key), values: entitySource.values, pack: "entity" }
  : { index: sourceIndices.get(key), values: source.values, pack: "client" };
const get = (node, path) => path.split(".").reduce((value, key) => value?.[key], node);
const seen = new Set();

for (const row of rows) {
  const id = `${row.language}/${row.target}`;
  const { index, values } = resolveSource(row.sourceKey);
  if (Object.keys(row).sort().join(",") !== "language,sourceKey,target" ||
    !localeIds[row.language] || seen.has(id) || index === undefined ||
    typeof get(english, row.target) !== "string" ||
    get(english, row.target) !== values[index]) {
    throw new Error(`Invalid alternate client place source: ${JSON.stringify(row)}`);
  }
  seen.add(id);
}
for (const row of flightRows) {
  const id = `${row.language}/map.publishedFlightPoints.${row.id}`;
  const { index, values } = resolveSource(row.sourceKey);
  const englishName = english.map.publishedFlightPoints[row.id];
  if (Object.keys(row).sort().join(",") !== "englishPart,id,language,sourceEnglish,sourceKey" ||
    !localeIds[row.language] || seen.has(id) || index === undefined ||
    values[index] !== row.sourceEnglish ||
    typeof englishName !== "string" ||
    englishName.split(row.englishPart).length !== 2) {
    throw new Error(`Invalid alternate client flight source: ${JSON.stringify(row)}`);
  }
  seen.add(id);
}

for (const [language, gameLocale] of Object.entries(localeIds)) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const entityPack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  let changed = 0;
  for (const row of rows.filter((candidate) => candidate.language === language)) {
    const { index, values, pack: packType } = resolveSource(row.sourceKey);
    const translated = (packType === "entity" ? entityPack : pack).values[index];
    const current = get(locale, row.target);
    if (!translated || translated === values[index] ||
      (current !== undefined && current !== values[index] && current !== translated)) {
      throw new Error(`${language}/${row.target}: missing source translation or conflicting value`);
    }
    if (current !== translated) {
      const parts = row.target.split(".");
      let node = locale;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      node[parts.at(-1)] = translated;
      changed += 1;
    }
  }
  for (const row of flightRows.filter((candidate) => candidate.language === language)) {
    const { index, pack: packType } = resolveSource(row.sourceKey);
    const translatedPart = (packType === "entity" ? entityPack : pack).values[index];
    const englishName = english.map.publishedFlightPoints[row.id];
    const translated = englishName.replace(row.englishPart, translatedPart);
    const current = locale.map.publishedFlightPoints[row.id];
    if (!translatedPart || translatedPart === row.englishPart ||
      (current !== undefined && current !== englishName && current !== translated)) {
      throw new Error(`${language}/map.publishedFlightPoints.${row.id}: conflicting value`);
    }
    if (current !== translated) {
      locale.map.publishedFlightPoints[row.id] = translated;
      changed += 1;
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: alternate client place labels are stale`);
  } else if (output !== raw) await writeFile(path, output);
  if (changed) console.log(`${language}: ${changed} alternate client place labels`);
}
