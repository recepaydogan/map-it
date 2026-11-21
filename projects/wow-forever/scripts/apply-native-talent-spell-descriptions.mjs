/** Reuse same-ID, same-rank Blizzard 70790 talent text in spell tooltips. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const inventory = await read("data/site-research/wowhead-check-2026-11-04/localization/inventory.json");
const provenanceByEnglish = new Map(inventory.entries.map((entry) => [entry.text, entry]));
const index = await read("public/data/spells/foreverdb/index.json");
const playerIds = new Set(index.filter((row) => row[4]).map((row) => String(row[0])));
const details = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const calculator = await read("public/data/classes/talent-calculator.json");
const talents = calculator.classes.flatMap((entry) => entry.trees.flatMap((tree) => tree.talents));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(languages).map(
  async ([language, locale]) => [language, {
    spell: await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`),
    talent: await read(`public/data/classes/locales/talents-${language}.json`),
  }])));
for (const [language, { spell, talent }] of Object.entries(packs)) {
  if (spell.locale !== languages[language] || spell.version !== 1 ||
    talent.sourceBuild !== calculator.sourceBuild || talent.language !== language) {
    throw new Error(`${language}: locale pack does not match its source`);
  }
}
const candidates = new Map();
for (const talent of talents) {
  for (let rank = 0; rank < talent.ranks.length; rank++) {
    const id = String(talent.ranks[rank]);
    const source = details[id];
    if (!playerIds.has(id) || !source?.d || source.n !== talent.n ||
      source.d !== talent.d[rank]) continue;
    const matches = candidates.get(id) ?? [];
    matches.push({ talentId: talent.id, rank, english: source.d });
    candidates.set(id, matches);
  }
}
let additions = 0;
const addedIds = new Set();
const byLanguage = {};
for (const [language, locale] of Object.entries(languages)) {
  const { spell, talent } = packs[language];
  let count = 0;
  for (const [id, matches] of candidates) {
    if (matches.length !== 1 || spell.entries[id]?.d) continue;
    const { talentId, rank, english } = matches[0];
    const provenance = provenanceByEnglish.get(english);
    if (!provenance?.kinds?.includes("talent") ||
      provenance.origins?.[language] !== "Blizzard-70790-template") continue;
    const candidate = talent.entries[talentId]?.ranks?.[rank];
    const value = candidate?.text;
    if (candidate?.source !== english || value !== provenance.translations?.[language] ||
      typeof value !== "string" ||
      !value.trim() || value === english || /\$[A-Za-z0-9{]/.test(value) ||
      numbers(value) !== numbers(english) ||
      hasEastAsianEnglishCarryover(value, locale)) continue;
    (spell.entries[id] ??= {}).d = value;
    additions++;
    count++;
    addedIds.add(id);
  }
  byLanguage[language] = count;
}
if (check && additions) throw new Error(`${additions} native talent tooltip fields are missing`);
if (!check) {
  for (const [language, { spell }] of Object.entries(packs)) {
    const path = join(root, `public/data/locales/wow-forever/spell-tooltip-${languages[language]}.json`);
    const original = await readFile(path, "utf8");
    const output = JSON.stringify(spell) + (original.endsWith("\n") ? "\n" : "");
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
console.log(`${additions} native talent descriptions across ${addedIds.size} spell IDs; ` +
  Object.entries(byLanguage).map(([language, count]) => `${language}=${count}`).join(" "));
