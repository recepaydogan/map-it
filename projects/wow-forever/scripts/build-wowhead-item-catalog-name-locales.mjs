/** Add source-matched Wowhead catalog names without replacing changed client item identities. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const directory = "public/data/locales/wow-forever";
const capturePath = "data/site-research/wowhead-item-catalog-name-captures.jsonl";
const localeCodes = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");
if (process.argv.length > 3 || (dryRun && check) ||
  process.argv.slice(2).some((arg) => !["--dry-run", "--check"].includes(arg))) {
  throw new Error("Use --dry-run, --check, or no option to apply");
}
const reviewed = await read("data/item-name-localization/wowhead-catalog-name-gap-ids.json");
const catalog = await read("public/data/items/catalog.json");
const source = await read(`${directory}/source.json`);
const packs = Object.fromEntries(await Promise.all(Object.values(localeCodes).map(async (locale) =>
  [locale, await read(`${directory}/${locale}.json`)])));
const provenance = await read(`${directory}/provenance.json`);
if (reviewed.version !== 1 || !Array.isArray(reviewed.ids) ||
  source.version !== 1 || source.keys.length !== source.values.length ||
  Object.values(packs).some((pack) => pack.version !== 1 ||
    pack.values.length !== source.keys.length)) throw new Error("Invalid item locale source");
const items = new Map(catalog.items.map((item) => [Number(item.id), item]));
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const records = new Map();
for (const line of (await readFile(join(root, capturePath), "utf8")).split(/\r?\n/).filter(Boolean)) {
  const record = JSON.parse(line);
  const key = `${record.id}:${record.locale}`;
  const expectedUrl = `https://nether.wowhead.com/forever/${record.locale === "en" ?
    "" : `${record.locale}/`}tooltip/item/${record.id}`;
  if (!reviewed.ids.includes(record.id) ||
    !["en", ...Object.keys(localeCodes)].includes(record.locale) ||
    record.url !== expectedUrl || typeof record.name !== "string" || !record.name.trim() ||
    (records.has(key) && records.get(key).name !== record.name)) {
    throw new Error(`Invalid or conflicting Wowhead item capture: ${key}`);
  }
  records.set(key, record);
}
let keysAdded = 0;
let ready = 0;
const skippedConflicts = [];
for (const id of reviewed.ids) {
  const item = items.get(id);
  const clientIndex = sourceIndex.get(`ItemSparse:${id}:4`);
  if (!item || clientIndex === undefined || source.values[clientIndex] === item.name) {
    throw new Error(`${id}: catalog/client identity changed`);
  }
  const english = records.get(`${id}:en`);
  if (!english || Object.keys(localeCodes).some((locale) => !records.has(`${id}:${locale}`))) continue;
  if (english.name !== item.name) throw new Error(`${id}: Wowhead English name changed`);
  const values = Object.fromEntries(Object.entries(localeCodes).map(([code, locale]) => {
    const name = records.get(`${id}:${code}`).name;
    if (name === english.name) throw new Error(`${id}/${code}: English carryover`);
    return [locale, name];
  }));
  const key = `WowheadItemCatalog:${id}:0`;
  let position = sourceIndex.get(key);
  if (position === undefined) {
    let conflict = false;
    for (const [index, value] of source.values.entries()) {
      if (value !== item.name) continue;
      for (const [locale, pack] of Object.entries(packs)) {
        const prior = pack.values[index];
        if (prior && prior !== values[locale]) {
          conflict = true;
        }
      }
    }
    if (conflict) {
      skippedConflicts.push(id);
      continue;
    }
    position = source.keys.length;
    sourceIndex.set(key, position);
    source.keys.push(key);
    source.values.push(item.name);
    for (const [locale, pack] of Object.entries(packs)) pack.values.push(values[locale]);
    keysAdded++;
  } else {
    if (source.values[position] !== item.name ||
      Object.entries(packs).some(([locale, pack]) => pack.values[position] !== values[locale])) {
      throw new Error(`${id}: published Wowhead item name differs from capture`);
    }
  }
  ready++;
}
provenance.sourceStrings = source.keys.length;
provenance.wowheadCatalogNameSupplement = { captureFile: capturePath, itemKeys: ready,
  localeTranslations: ready * Object.keys(localeCodes).length, skippedConflicts };
const outputs = [
  [`${directory}/source.json`, JSON.stringify(source)],
  ...Object.entries(packs).map(([locale, pack]) =>
    [`${directory}/${locale}.json`, JSON.stringify(pack)]),
  [`${directory}/provenance.json`, `${JSON.stringify(provenance, null, 2)}\n`],
];
if (check) {
  for (const [path, value] of outputs) {
    if (await readFile(join(root, path), "utf8") !== value) throw new Error(`${path} is stale`);
  }
} else if (!dryRun) {
  for (const [path, value] of outputs) await writeFile(join(root, path), value);
}
console.log(`${ready} complete Wowhead item IDs; ${keysAdded} keys to add; ` +
  `${ready * Object.keys(localeCodes).length} localized names; ` +
  `${skippedConflicts.length} conflicts skipped: ${skippedConflicts.join(", ") || "none"}.`);
