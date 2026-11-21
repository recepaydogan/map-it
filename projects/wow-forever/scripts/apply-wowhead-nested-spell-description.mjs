/** Complete Feral Charge's nested tooltip with Wowhead's localized requirements. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sameClassDescriptionText } from "./lib/wowhead-class-description-captures.mjs";
import { decodeHtml, hasEastAsianEnglishCarryover, numbers } from
  "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const lines = async (path) => (await readFile(join(root, path), "utf8"))
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Use --check or no option to apply");
}
const id = 1238122;
const details = await read(`public/data/spells/foreverdb/${id % 64}.json`);
const source = details[id];
const captured = new Map((await lines(
  "data/site-research/wowhead-player-spell-description-gaps.jsonl"))
  .filter((record) => record.id === id)
  .map((record) => [record.locale, record]));
const english = captured.get("en");
if (!source?.d || english?.name !== source.n ||
  english.url !== `https://nether.wowhead.com/forever/tooltip/spell/${id}` ||
  !sameClassDescriptionText(english.text, source.d)) {
  throw new Error("Feral Charge source does not match Wowhead");
}
const evidence = new Map((await lines(
  "data/site-research/wowhead-locale-captures.jsonl"))
  .filter((record) => record.kind === "spell" &&
    [5217, 415744].includes(record.id))
  .map((record) => [`${record.id}:${record.locale}`, record]));
const requirements = (record) => [...(record.tooltip?.matchAll(
  /class="wowhead-tooltip-requirements">([^<]+)</g) ?? [])]
  .map((match) => decodeHtml(match[1]));
if (!requirements(evidence.get("5217:en") ?? {}).includes("Requires Druid") ||
  !requirements(evidence.get("415744:en") ?? {}).includes("Requires level 1")) {
  throw new Error("Wowhead requirement source phrases changed");
}
const languages = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
let additions = 0;
const packs = {};
for (const [code, locale] of Object.entries(languages)) {
  const record = captured.get(code);
  const classEvidence = evidence.get(`5217:${code}`);
  const levelEvidence = evidence.get(`415744:${code}`);
  const classUrl = `https://nether.wowhead.com/forever/${code}/tooltip/spell/5217`;
  const levelUrl = `https://nether.wowhead.com/forever/${code}/tooltip/spell/415744`;
  const originalUrl = `https://nether.wowhead.com/forever/${code}/tooltip/spell/${id}`;
  const classPhrase = requirements(classEvidence ?? {}).find((value) =>
    !/\d/.test(value) && value !== "Requires Druid");
  const levelPhrase = requirements(levelEvidence ?? {}).find((value) =>
    /\b1\b/.test(value) && value !== "Requires level 1");
  if (record?.url !== originalUrl || classEvidence?.url !== classUrl ||
    levelEvidence?.url !== levelUrl || !classPhrase || !levelPhrase ||
    !record.text?.includes("Requires Druid Requires level 1")) {
    throw new Error(`${locale}: missing localized Wowhead requirement evidence`);
  }
  const value = record.text.replace("Requires Druid Requires level 1",
    `${classPhrase} ${levelPhrase}`);
  if (value === english.text || /\bRequires\b/.test(value) ||
    numbers(value) !== numbers(english.text) ||
    hasEastAsianEnglishCarryover(value, locale)) {
    throw new Error(`${locale}: unusable localized Feral Charge description`);
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
if (check && additions) throw new Error(`${additions} Feral Charge descriptions are missing`);
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
console.log(`${additions} Wowhead Feral Charge descriptions added`);
