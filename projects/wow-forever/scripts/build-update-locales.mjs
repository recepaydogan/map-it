/** Translate release-note prose while preserving the original linked destinations. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const entityIndices = new Map(entitySource.keys.map((key, index) => [key, index]));
const entityFallbacks = await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json");
if (entityFallbacks.version !== 1 || !entityFallbacks.locales) {
  throw new Error("Invalid map entity fallback catalog");
}
const itemCatalog = await read("public/data/items/catalog.json");
const itemNames = await read("data/item-name-localization/pfquest-update-items.json");
const catalogItems = new Map(itemCatalog.items.map((item) => [item.id, item]));
const catalog = {};
for (const file of (await readdir(join(root, "data/update-localization"))).filter((name) => name.endsWith(".json")).sort()) {
  const group = await read(`data/update-localization/${file}`);
  for (const [language, versions] of Object.entries(group)) {
    catalog[language] ??= {};
    for (const [version, segments] of Object.entries(versions)) {
      if (catalog[language][version]) throw new Error(`Duplicate update version: ${language}/${version}`);
      catalog[language][version] = segments;
    }
  }
}
const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const variableNames = (value) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
  .map((match) => match[1]).sort();

function proseLeaves(node, path = [], output = []) {
  if (typeof node === "string") {
    if (!["version", "target", "categoryId"].includes(path.at(-1))) output.push([path, node]);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) proseLeaves(value, [...path, key], output);
  }
  return output;
}

for (const [language, gameLocale] of Object.entries(packs)) {
  if (!catalog[language] || Object.keys(catalog[language]).some((version) => !english.updates.releases[version])) {
    throw new Error(`${language}: missing or unknown update version`);
  }
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const entityPack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  locale.updates ??= {};
  locale.updates.releases ??= {};
  for (const [version, entry] of Object.entries(catalog[language])) {
    const translations = typeof entry === "string" && entry.startsWith("@")
      ? catalog[entry.slice(1)]?.[version] : entry;
    const original = english.updates.releases[version];
    const leaves = proseLeaves(original);
    if (!Array.isArray(translations) || translations.length !== leaves.length) {
      throw new Error(`${language}/${version}: expected ${leaves.length} text segments`);
    }
    const localized = structuredClone(original);
    for (let index = 0; index < leaves.length; index += 1) {
      const [keys, sourceText] = leaves[index];
      const translation = translations[index];
      if (typeof translation !== "string") {
        throw new Error(`${language}/${version}: invalid text segment ${index}`);
      }
      const withEntityNames = translation.replace(/\{\{ENTITY:((?:Quest|Creature):\d+:\d+)\|([^}]+)\}\}/g,
        (_, entityKey, label) => {
          const entityIndex = entityIndices.get(entityKey);
          const localizedName = entityIndex === undefined ? null :
            entityPack.values[entityIndex] ?? entityFallbacks.locales[gameLocale]?.[entityKey];
          if (entityIndex === undefined || entitySource.values[entityIndex] !== label ||
            !sourceText.includes(label) || !localizedName) {
            throw new Error(`${language}/${version}/${index}: unavailable game entity ${entityKey}`);
          }
          return localizedName;
        });
      const withItemNames = withEntityNames.replace(/\{\{PFITEM:(\d+)\|([^}]+)\}\}/g,
        (_, itemId, label) => {
          const record = itemNames.items[itemId];
          const sourceLocale = itemNames.fallbackLocales[language] ?? language;
          if (!record || record.en !== label || catalogItems.get(itemId)?.name !== label ||
            !sourceText.includes(label) || !record.translations[sourceLocale]) {
            throw new Error(`${language}/${version}/${index}: unavailable verified item ${itemId}`);
          }
          return record.translations[sourceLocale];
        });
      const withMapQuest = withItemNames.replace(/\{\{MAPQUEST:(\d+)\|([^}]+)\}\}/g,
        (_, markerId, label) => {
          if (english.map.questMarkers[markerId]?.name !== label ||
            !sourceText.includes(label) || !locale.map.questMarkers[markerId]?.name) {
            throw new Error(`${language}/${version}/${index}: unavailable map quest ${markerId}`);
          }
          return locale.map.questMarkers[markerId].name;
        });
      const resolved = withMapQuest.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g,
        (_, clientKey, label) => {
          const clientIndex = sourceIndices.get(clientKey);
          if (clientIndex === undefined || source.values[clientIndex]?.toLocaleLowerCase("en") !== label.toLocaleLowerCase("en") ||
            !sourceText.includes(label) || !pack.values[clientIndex]) {
            throw new Error(`${language}/${version}/${index}: unavailable client term ${clientKey}`);
          }
          return pack.values[clientIndex];
        });
      if (JSON.stringify(variableNames(resolved)) !== JSON.stringify(variableNames(sourceText))) {
        throw new Error(`${language}/${version}/${index}: interpolation changed`);
      }
      const parent = keys.slice(0, -1).reduce((node, key) => node[key], localized);
      parent[keys.at(-1)] = resolved;
    }
    locale.updates.releases[version] = localized;
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: updates are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${Object.keys(catalog[language]).length} historical versions`);
}
