/** Use same-ID Wowhead prose with the app's verified Demonic Brand rank values. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const id = 1293695;
const detail = (await read(`public/data/spells/foreverdb/${id % 64}.json`))[id];
const records = (await readFile(join(root,
  "data/site-research/wowhead-class-description-gaps.jsonl"), "utf8"))
  .split(/\r?\n/).filter(Boolean).map(JSON.parse)
  .filter((record) => record.id === id);
const captures = new Map(records.map((record) => [record.locale, record]));
if (captures.size !== 9 || records.length !== 9 || detail?.n !== "Demonic Brand") {
  throw new Error("Demonic Brand captures or source changed");
}
const english = captures.get("en");
const englishUrl = `https://nether.wowhead.com/forever/tooltip/spell/${id}`;
const adjustedEnglish = english?.text
  ?.replace("generates 50% less threat", "generates 17% less threat")
  .replace("pet's next 3 attacks", "pet's next 2 attacks");
const sameFormulaAndWords = (value) => value.replace(/[\[\]()\s]/g, "").toLowerCase();
if (english?.url !== englishUrl || english.name !== detail.n ||
  !english.text.includes("generates 50% less threat") ||
  !english.text.includes("pet's next 3 attacks") ||
  !detail.d.includes("generates 17% less threat") ||
  !detail.d.includes("pet's next 2 attacks") ||
  sameFormulaAndWords(adjustedEnglish) !== sameFormulaAndWords(detail.d)) {
  throw new Error("Demonic Brand Wowhead text differs beyond rank values and formula formatting");
}
const languages = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = {};
let additions = 0;
for (const [code, locale] of Object.entries(languages)) {
  const record = captures.get(code);
  const expectedUrl = `https://nether.wowhead.com/forever/${code}/tooltip/spell/${id}`;
  const original = record?.text;
  if (record?.url !== expectedUrl || typeof original !== "string" ||
    original === english.text ||
    [...original.matchAll(/\b50(?=[\s\u00a0]*%)/g)].length !== 1 ||
    [...original.matchAll(/(?<!\d)3(?!\d)/g)].length !== 1 ||
    numbers(original) !== numbers(english.text)) {
    throw new Error(`${locale}: localized Wowhead rank does not match its English page`);
  }
  const value = original.replace(/\b50(?=[\s\u00a0]*%)/, "17")
    .replace(/(?<!\d)3(?!\d)/, "2");
  if (numbers(value) !== numbers(detail.d) ||
    /\$[A-Za-z0-9{]/.test(value) ||
    hasEastAsianEnglishCarryover(value, locale)) {
    throw new Error(`${locale}: localized Demonic Brand values do not match the app rank`);
  }
  const pack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
  if (pack.version !== 1 || pack.locale !== locale ||
    (pack.entries[id]?.d && pack.entries[id].d !== value)) {
    throw new Error(`${locale}: conflicting spell tooltip pack`);
  }
  if (!pack.entries[id]?.d) {
    (pack.entries[id] ??= {}).d = value;
    additions++;
  }
  packs[locale] = pack;
}
if (check && additions) throw new Error(`${additions} Demonic Brand descriptions are missing`);
if (!check) {
  for (const [locale, pack] of Object.entries(packs)) {
    const path = join(root, `public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
    const original = await readFile(path, "utf8");
    const output = JSON.stringify(pack) + (original.endsWith("\n") ? "\n" : "");
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
console.log(`${additions} Wowhead Demonic Brand descriptions added`);
