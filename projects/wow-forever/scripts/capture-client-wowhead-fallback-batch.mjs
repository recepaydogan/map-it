/** Capture installed-client Spell templates for unresolved Wowhead locale gaps. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchLinkedSpellTemplate, spellVariableSignature } from
  "./lib/match-client-spell-resolved.mjs";
import { description } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/site-research/client-wowhead-fallback.json");
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const report = await read("data/site-research/wowhead-spell-candidates.json");
const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
const invariants = await read("data/spell-tooltip-localization/reviewed-invariants.json");
if (invariants.version !== 1 || !invariants.entries) {
  throw new Error("Invalid reviewed spell invariant catalog");
}
const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`)])));
const details = new Map((await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  Object.values(await read(`public/data/spells/foreverdb/${shard}.json`)))))
  .flat().map((spell) => [spell.id, spell]));
const englishCaptures = new Map();
for (const [rawId, entry] of Object.entries(invariants.entries)) {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || details.get(id)?.d !== entry.source ||
    !Array.isArray(entry.locales) || !entry.locales.length || !entry.reason) {
    throw new Error(`Stale reviewed spell invariant ${rawId}`);
  }
  for (const locale of entry.locales) {
    if (!locales.includes(locale) || reviewed.spells[id]?.locales[locale] ||
      !report.skipped.some((row) => row.id === id && row.locale === locale)) {
      throw new Error(`Invalid reviewed spell invariant ${id}/${locale}`);
    }
  }
}
for (const line of (await readFile(join(root,
  "data/site-research/wowhead-locale-captures.jsonl"), "utf8"))
  .split(/\r?\n/).filter(Boolean)) {
  const capture = JSON.parse(line);
  if (capture.kind === "spell" && capture.locale === "en") {
    englishCaptures.set(capture.id, capture);
  }
}
const tableCatalog = await read("data/client-research/db2-table-names.json");
const registration = tableCatalog.identified.find(({ name }) => name === "Spell");
if (!registration) throw new Error("Missing installed-client Spell table registration");
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const unresolved = new Map();
for (const skipped of report.skipped) {
  const source = details.get(skipped.id)?.d;
  if (!source) continue;
  const affected = skipped.reason === "English source mismatch"
    ? locales : [skipped.locale];
  for (const locale of affected) {
    if (!locales.includes(locale) || packs[locale].entries[skipped.id]?.d ||
      reviewed.spells[skipped.id]?.locales[locale] ||
      invariants.entries[skipped.id]?.locales.includes(locale)) continue;
    const record = unresolved.get(skipped.id) ?? { id: skipped.id, source,
      wowhead: description(englishCaptures.get(skipped.id) ?? { tooltip: "" }),
      reasons: {}, clientEnglishTemplate: null,
      clientEnglishMatchesSource: false, clientEnglishMatchesWowhead: false,
      locales: {} };
    record.reasons[locale] = skipped.reason;
    unresolved.set(skipped.id, record);
  }
}
const records = [...unresolved.values()].sort((left, right) => left.id - right.id);

function spellStrings(reader, id) {
  const row = reader.getRowData(id);
  if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return null;
  const values = [];
  let start = 0;
  for (let field = 0; field < 3; field += 1) {
    const end = row.data.indexOf(0, start);
    if (end < 0) return null;
    values.push(row.data.subarray(start, end).toString("utf8"));
    start = end + 1;
  }
  return values;
}

function openSpellTable(locale) {
  const storage = casc.Storage.openEx(installDir, {
    codeName: "wow_classic_beta", region: "us",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    return { storage, reader: readLocalWdc5(storage.readFile(filename)).reader };
  } catch (error) {
    storage.close();
    throw error;
  }
}

let clientBuild;
const english = openSpellTable("enUS");
try {
  clientBuild = english.storage.getProductInfo().buildNumber;
  for (const record of records) {
    record.clientEnglishTemplate = spellStrings(english.reader, record.id)?.[1] ?? null;
    if (!record.clientEnglishTemplate) continue;
    record.clientEnglishMatchesSource =
      matchLinkedSpellTemplate(record.clientEnglishTemplate, record.source) !== undefined;
    record.clientEnglishMatchesWowhead = !!record.wowhead &&
      matchLinkedSpellTemplate(record.clientEnglishTemplate, record.wowhead) !== undefined;
  }
} finally {
  english.storage.close();
}

for (const locale of locales) {
  const native = openSpellTable(locale);
  try {
    for (const record of records) {
      if (!Object.hasOwn(record.reasons, locale)) continue;
      const template = spellStrings(native.reader, record.id)?.[1] ?? null;
      record.locales[locale] = { template,
        differsFromEnglish: !!template && template !== record.clientEnglishTemplate,
        sameVariableSignature: !!template && !!record.clientEnglishTemplate &&
          spellVariableSignature(template) ===
            spellVariableSignature(record.clientEnglishTemplate) };
    }
  } finally {
    native.storage.close();
  }
}

const counts = Object.fromEntries(locales.map((locale) => [locale, {
  missing: 0, english: 0, localized: 0, sameVariableSignature: 0,
}]));
for (const record of records) {
  for (const [locale, entry] of Object.entries(record.locales)) {
    const count = counts[locale];
    if (!entry.template) count.missing += 1;
    else if (!entry.differsFromEnglish) count.english += 1;
    else {
      count.localized += 1;
      if (entry.sameVariableSignature) count.sameVariableSignature += 1;
    }
  }
}
await writeFile(output, `${JSON.stringify({ version: 1, clientBuild,
  sourceReport: "wowhead-spell-candidates.json",
  reviewedInvariants: "reviewed-invariants.json", records, counts }, null, 2)}\n`);
console.log(`${records.length} unresolved spell IDs captured from installed client build ${clientBuild}.`);
console.log(`${Object.keys(invariants.entries).length} reviewed invariant IDs / ` +
  `${Object.values(invariants.entries).reduce((count, entry) => count + entry.locales.length, 0)} locale records.`);
for (const [locale, count] of Object.entries(counts)) {
  console.log(`${locale}: ${count.localized} localized; ${count.english} English; ` +
    `${count.missing} absent; ${count.sameVariableSignature} variable-compatible.`);
}
