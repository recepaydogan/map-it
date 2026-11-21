/** Match resolved spell text to the same installed client's localized Spell table. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const localeDir = join(root, "public/data/locales/wow-forever");
const spellDir = join(root, "public/data/spells/foreverdb");
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const check = process.argv.includes("--check");
const reportOnly = process.argv.includes("--report-only");
if (check && reportOnly) throw new Error("Use --check or --report-only, not both");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const gapReport = { version: 1, locales: {} };
const supplemental = {
  r: (await read(join(root,
    "data/spell-tooltip-localization/reviewed-rank-fallbacks.json"))).ranks,
  a: (await read(join(root,
    "data/spell-tooltip-localization/reviewed-aura-spells.json"))).spells,
  old: (await read(join(root,
    "data/spell-tooltip-localization/reviewed-classic-overrides.json"))).spells,
};
const directWowhead = await read(join(root,
  "data/spell-tooltip-localization/wowhead-direct-review.json"));
const catalog = await read(join(root, "data/client-research/db2-table-names.json"));
const registration = catalog.identified.find(({ name }) => name === "Spell");
if (!registration) throw new Error("Missing installed client Spell table registration");
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const index = await read(join(spellDir, "index.json"));
const shards = await Promise.all(Array.from({ length: 64 }, (_, shard) =>
  read(join(spellDir, `${shard}.json`))));
const details = shards.flatMap(Object.values);
const classCatalog = await read(join(root, "public/data/classes/catalog.json"));
const classCatalogDescriptions = new Set(classCatalog.classes.flatMap((entry) => [
  ...entry.trees.flatMap((tree) => tree.new.map((talent) => talent.description)),
  ...entry.abilities.new.map((ability) => ability.description),
]).filter(Boolean));
const itemCatalog = await read(join(root, "public/data/items/catalog.json"));
const itemEffectDescriptions = new Set(itemCatalog.items.flatMap((item) =>
  (item.siteEffects ?? []).map((effect) => effect.text)));
const source = await read(join(localeDir, "source.json"));
const sourceNames = new Map(source.keys.map((key, index) => [key, source.values[index]]));
const sourceIndexes = new Map(source.keys.map((key, index) => [key, index]));
const numericSignature = (value) => (value.match(/\d+(?:[.,]\d+)?/g) ?? [])
  .map((number) => number.replace(",", ".")).sort().join("|");
const spanishRuptureRanks = new Set([1943, 8639, 8640, 11273, 11274, 11275]);
const chineseHemorrhageTemplate = "发动瞬发打击，造成$m4%武器伤害（装备匕首时为$m5%），并使目标受到来自游荡者的割裂伤害提高$m3%，持续$d。奖励$s2个$l连击点数。";
const chineseHemorrhageSource = "An instant strike that deals 100% weapon damage (145% if a Dagger is equipped) and causes the target to take 15% increased Rupture damage from the Rogue. Lasts 15 sec. Awards 1 Combo Point .";
function correctReviewedClientTemplate(id, locale, sourceText, template) {
  if (id === 16511 && locale === "zhCN" && sourceText === chineseHemorrhageSource &&
    template === chineseHemorrhageTemplate) {
    return template.replace("$l连击点数。", "连击点数。");
  }
  return template;
}
function correctReviewedClientTooltip(id, locale, sourceText, translation) {
  if (!translation || locale !== "esES" || !spanishRuptureRanks.has(id) ||
    !/^\s*2 points: \d+ damage over 10 secs$/m.test(sourceText)) return translation;
  // The installed esES row incorrectly says 8 s for the second combo point.
  return translation.replace(/^(2 puntos: \d+ p\. de daño durante )8 s$/m, "$1" + "10 s");
}
const reviewed = await read(join(root, "data/spell-tooltip-localization/reviewed-overrides.json"));
if (reviewed.version !== 1 || !reviewed.spells) throw new Error("Invalid reviewed spell tooltip overrides");
const reviewedFamilies = new Map();
const sharedDescriptions = new Map();
const reviewedAuras = new Map();
for (const [sourceText, record] of Object.entries(reviewed.reviewedAuras ?? {})) {
  if (!Array.isArray(record.ids) || !record.ids.length ||
    Object.entries(record.locales ?? {}).some(([locale, translated]) =>
      !locales.includes(locale) || typeof translated !== "string" ||
      !translated.trim() ||
      (translated === sourceText && !record.sameSpellingLocales?.includes(locale)) ||
      numericSignature(translated) !== numericSignature(sourceText))) {
    throw new Error(`Invalid reviewed spell aura: ${sourceText}`);
  }
  for (const id of record.ids) {
    if (!Number.isSafeInteger(id) || reviewedAuras.has(id)) {
      throw new Error(`Reviewed spell aura source changed for ${id}`);
    }
    if (shards[id % 64][id]?.a !== sourceText) {
      console.warn(`Skipping outdated reviewed spell aura ${id}`);
      continue;
    }
    reviewedAuras.set(id, record);
  }
}
for (const [sourceText, record] of Object.entries(reviewed.sharedDescriptions ?? {})) {
  const sourceNumbers = (sourceText.match(/\d+/g) ?? []).sort().join("|");
  if (!sourceText.trim() || !Array.isArray(record.ids) || !record.ids.length ||
    locales.some((locale) => typeof record.locales?.[locale] !== "string" ||
      !record.locales[locale].trim() || record.locales[locale] === sourceText ||
      /\$[A-Za-z0-9{]/.test(record.locales[locale]) ||
      (record.locales[locale].match(/\d+/g) ?? []).sort().join("|") !== sourceNumbers)) {
    throw new Error(`Invalid shared spell description: ${sourceText}`);
  }
  for (const id of record.ids) {
    if (!Number.isSafeInteger(id) || sharedDescriptions.has(id) ||
      shards[id % 64][id]?.d !== sourceText) {
      throw new Error(`Shared spell description source changed for ${id}`);
    }
    sharedDescriptions.set(id, record);
  }
}
const familyClientMatches = (family, text) => family.englishTemplate
  ? text.trimEnd() === family.englishTemplate.trimEnd()
  : new RegExp(family.clientPattern).test(text);
for (const [familyName, family] of Object.entries(reviewed.families ?? {})) {
  if ((!family.englishTemplate && !family.clientPattern) || !Array.isArray(family.ids) ||
    locales.some((locale) => !family.locales?.[locale] ||
      (family.auraSourcePattern && !family.auraLocales?.[locale]))) {
    throw new Error(`Invalid reviewed spell tooltip family ${familyName}`);
  }
  if (family.clientPattern) new RegExp(family.clientPattern);
  if (family.sourcePattern) new RegExp(family.sourcePattern);
  if (family.auraSourcePattern) new RegExp(family.auraSourcePattern);
  for (const id of family.ids) {
    if (!Number.isSafeInteger(id) || reviewedFamilies.has(id)) {
      throw new Error(`Duplicate reviewed spell tooltip family ID ${id}`);
    }
    reviewedFamilies.set(id, family);
  }
}
const activeReviewedSpells = new Map();
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
for (const [id, record] of Object.entries(reviewed.spells)) {
  const detail = shards[Number(id) % 64][id];
  if (!detail || Object.entries(record.locales ?? {}).some(([locale, value]) =>
      !locales.includes(locale) || typeof value !== "string" || !value.trim() ||
      value === record.source || /\$[A-Za-z0-9{]/.test(value))) {
    throw new Error(`Invalid reviewed spell tooltip override ${id}`);
  }
  if (normalizeWhitespace(detail.d ?? "") !== normalizeWhitespace(record.source)) {
    console.warn(`Skipping outdated reviewed spell description ${id}`);
    continue;
  }
  activeReviewedSpells.set(id, record);
}

function openSpellTable(locale) {
  const localeMask = casc[`CASC_LOCALE_${locale.toUpperCase()}`];
  if (!localeMask) throw new Error(`Unknown client locale ${locale}`);
  const storage = casc.Storage.openEx(installDir, {
    codeName: "wow_classic_beta", region: "us", localeMask, online: false,
  });
  try {
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    return { storage, reader };
  } catch (error) {
    storage.close();
    throw error;
  }
}

function strings(reader, id) {
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

const english = openSpellTable("enUS");
const matches = new Map();
let matchingClassicDescriptions = 0;
const build = english.storage.getProductInfo().buildNumber;
try {
  for (const row of index) {
    const id = row[0];
    const detail = shards[id % 64][id];
    const client = strings(english.reader, id);
    if (!client || !detail || sourceNames.get(`SpellName:${id}:0`) !== row[1]) continue;
    const description = detail.d && client[1]
      ? matchLinkedSpellTemplate(client[1], detail.d) : undefined;
    const aura = detail.a && client[2]
      ? matchLinkedSpellTemplate(client[2], detail.a) : undefined;
    const oldDescription = detail.old && detail.old !== detail.d && client[1]
      ? matchLinkedSpellTemplate(client[1], detail.old) : undefined;
    if (oldDescription !== undefined) matchingClassicDescriptions += 1;
    if (client[0] === detail.r || description !== undefined || aura !== undefined ||
      oldDescription !== undefined) {
      matches.set(id, { detail, client, description, aura, oldDescription });
    }
  }
} finally {
  english.storage.close();
}
console.log(`Same-ID Classic descriptions matching the installed client template: ${matchingClassicDescriptions}`);
for (const [id, family] of reviewedFamilies) {
  const match = matches.get(id);
  if (!match || !familyClientMatches(family, match.client[1]) ||
    (!family.sourcePattern && match.description === undefined) ||
    (family.sourcePattern && !new RegExp(family.sourcePattern).exec(match.detail.d)?.groups) ||
    (family.auraSourcePattern && !new RegExp(family.auraSourcePattern).exec(match.detail.a)?.groups)) {
    console.warn(`Skipping outdated reviewed spell tooltip family ${id}`);
    reviewedFamilies.delete(id);
  }
}

for (const locale of locales) {
  const native = openSpellTable(locale);
  const gamePack = await read(join(localeDir, `${locale}.json`));
  if (gamePack.version !== 1 || gamePack.values.length !== source.keys.length) {
    throw new Error(`${locale}: invalid client game-name locale pack`);
  }
  const language = { deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr", koKR: "ko",
    ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant" }[locale];
  const classPack = await read(join(root, `public/data/classes/locales/${language}.json`));
  const itemEffectPack = await read(join(localeDir, `item-effects-${locale}.json`));
  if (classPack.version !== 1 || !classPack.translations ||
    Object.entries(classPack.translations).some(([sourceText, translated]) =>
      !classCatalogDescriptions.has(sourceText) || typeof translated !== "string" ||
      !translated.trim() || translated === sourceText || /\{\{|\$[A-Za-z0-9{]/.test(translated))) {
    throw new Error(`${language}: invalid class catalog prose pack`);
  }
  if (itemEffectPack.version !== 1 || !itemEffectPack.translations ||
    Object.entries(itemEffectPack.translations).some(([sourceText, translated]) =>
      !itemEffectDescriptions.has(sourceText) || typeof translated !== "string" || !translated.trim())) {
    throw new Error(`${locale}: invalid item effect locale pack`);
  }
  const entries = {};
  const counts = { rank: 0, description: 0, aura: 0, old: 0 };
  try {
    if (native.storage.getProductInfo().buildNumber !== build) {
      throw new Error(`${locale}: client build differs from English Spell table`);
    }
    for (const [id, match] of matches) {
      const translated = strings(native.reader, id);
      if (!translated) continue;
      const entry = {};
      if (match.detail.r && match.client[0] === match.detail.r &&
        translated[0] && translated[0] !== match.client[0] &&
        numericSignature(translated[0]) === numericSignature(match.detail.r)) {
        entry.r = translated[0];
        counts.rank += 1;
      }
      for (const [field, key, variables] of [
        [1, "d", match.description], [2, "a", match.aura],
      ]) {
        if (variables === undefined || !translated[field] ||
          translated[field] === match.client[field]) continue;
        const template = correctReviewedClientTemplate(id, locale, match.detail[key],
          translated[field]);
        const rendered = correctReviewedClientTooltip(id, locale, match.detail[key],
          renderResolvedSpellTemplate(template, variables, locale, match.detail[key]));
        if (!rendered || rendered === match.detail[key]) continue;
        entry[key] = rendered;
        counts[key === "d" ? "description" : "aura"] += 1;
      }
      if (match.oldDescription !== undefined && translated[1] &&
        translated[1] !== match.client[1]) {
        const rendered = correctReviewedClientTooltip(id, locale, match.detail.old,
          renderResolvedSpellTemplate(translated[1],
            match.oldDescription, locale, match.detail.old));
        if (rendered && rendered !== match.detail.old &&
          numericSignature(rendered) === numericSignature(match.detail.old)) {
          entry.old = rendered;
          counts.old += 1;
        }
      }
      const family = reviewedFamilies.get(id);
      if (family) {
        if (!familyClientMatches(family, match.client[1])) {
          throw new Error(`${locale}: reviewed spell family source changed for ${id}`);
        }
        if (!entry.d) {
          const captures = family.sourcePattern
            ? new RegExp(family.sourcePattern).exec(match.detail.d)?.groups : null;
          const rendered = captures
            ? family.locales[locale].replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
              (_, key) => captures[key] ?? `{{${key}}}`)
            : renderResolvedSpellTemplate(family.locales[locale],
              match.description, locale, match.detail.d);
          if (!rendered || rendered === match.detail.d) {
            throw new Error(`${locale}: reviewed spell family could not render ${id}`);
          }
          if (/\{\{[^}]+\}\}|\$[A-Za-z0-9{]/.test(rendered)) {
            throw new Error(`${locale}: unresolved reviewed spell family variable ${id}`);
          }
          entry.d = rendered;
          counts.description += 1;
        }
        if (family.auraSourcePattern && !entry.a) {
          const captures = new RegExp(family.auraSourcePattern).exec(match.detail.a)?.groups;
          const rendered = family.auraLocales[locale].replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
            (_, key) => captures?.[key] ?? `{{${key}}}`);
          if (!captures || !rendered || rendered === match.detail.a ||
            /\{\{[^}]+\}\}|\$[A-Za-z0-9{]/.test(rendered)) {
            throw new Error(`${locale}: reviewed spell family aura could not render ${id}`);
          }
          entry.a = rendered;
          counts.aura += 1;
        }
      }
      if (Object.keys(entry).length) entries[id] = entry;
    }
    for (const [id, record] of activeReviewedSpells) {
      const value = record.locales?.[locale];
      if (!value) continue;
      if (!entries[id]?.d) counts.description += 1;
      (entries[id] ??= {}).d = value;
    }
    for (const [id, record] of reviewedAuras) {
      const value = record.locales?.[locale];
      if (!value) continue;
      if (!entries[id]?.a) counts.aura += 1;
      (entries[id] ??= {}).a = value;
    }
    for (const [id, record] of sharedDescriptions) {
      if (entries[id]?.d) continue;
      (entries[id] ??= {}).d = record.locales[locale];
      counts.description += 1;
    }
    for (const detail of details) {
      if (!detail.d || detail.d !== detail.n || entries[detail.id]?.d) continue;
      const key = `SpellName:${detail.id}:0`;
      const index = sourceIndexes.get(key);
      if (index === undefined || source.values[index] !== detail.n) continue;
      const translated = gamePack.values[index];
      if (!translated || translated === detail.n) continue;
      (entries[detail.id] ??= {}).d = translated;
      counts.description += 1;
    }
    for (const detail of details) {
      const translated = classPack.translations[detail.d];
      if (!translated || entries[detail.id]?.d) continue;
      (entries[detail.id] ??= {}).d = translated;
      counts.description += 1;
    }
    for (const detail of details) {
      const translated = itemEffectPack.translations[detail.d];
      if (!translated || translated === detail.d || entries[detail.id]?.d) continue;
      if ((detail.d.match(/\d+/g) ?? []).sort().join("|") !==
        (translated.match(/\d+/g) ?? []).sort().join("|")) {
        throw new Error(`${locale}: item effect spell numbers changed for ${detail.id}`);
      }
      (entries[detail.id] ??= {}).d = translated;
      counts.description += 1;
    }
    const translatedBySource = new Map();
    for (const detail of details) {
      const translation = entries[detail.id]?.d;
      if (!detail.d || !translation) continue;
      if (!translatedBySource.has(detail.d)) translatedBySource.set(detail.d, translation);
      else if (translatedBySource.get(detail.d) !== translation) translatedBySource.set(detail.d, null);
    }
    for (const detail of details) {
      if (!detail.d || entries[detail.id]?.d) continue;
      const translation = translatedBySource.get(detail.d);
      if (!translation || translation === detail.d) continue;
      (entries[detail.id] ??= {}).d = translation;
      counts.description += 1;
    }
    for (const [field, countField] of [["a", "aura"], ["r", "rank"]]) {
      const translatedFields = new Map();
      for (const detail of details) {
        const translation = entries[detail.id]?.[field];
        if (!detail[field] || !translation) continue;
        if (!translatedFields.has(detail[field])) translatedFields.set(detail[field], translation);
        else if (translatedFields.get(detail[field]) !== translation) translatedFields.set(detail[field], null);
      }
      for (const detail of details) {
        if (!detail[field] || entries[detail.id]?.[field]) continue;
        const translation = translatedFields.get(detail[field]);
        if (!translation || translation === detail[field]) continue;
        (entries[detail.id] ??= {})[field] = translation;
        counts[countField] += 1;
      }
    }
    for (const detail of details) {
      if (!detail.old || detail.old === detail.d || entries[detail.id]?.old) continue;
      const translation = translatedBySource.get(detail.old);
      if (!translation || translation === detail.old ||
        numericSignature(translation) !== numericSignature(detail.old)) continue;
      (entries[detail.id] ??= {}).old = translation;
      counts.old += 1;
    }
  } finally {
    native.storage.close();
  }
  for (const [field, countField] of [["r", "rank"], ["a", "aura"], ["old", "old"]]) {
    for (const [id, record] of Object.entries(supplemental[field])) {
      const detail = shards[Number(id) % 64][id];
      const value = record.locales?.[locale];
      if (!value) continue;
      if (!detail || detail[field] !== record.source) {
        console.warn(`Skipping outdated reviewed ${field} translation ${id}`);
        continue;
      }
      if (/\$[A-Za-z0-9{]/.test(value)) {
        throw new Error(`${locale}: invalid reviewed ${field} translation for ${id}`);
      }
      if (entries[id]?.[field]) continue;
      (entries[id] ??= {})[field] = value;
      counts[countField] += 1;
    }
  }
  for (const record of directWowhead.translations) {
    if (record.locale !== locale || record.numericDifference ||
      record.englishSourceDifference) continue;
    const detail = shards[record.id % 64][record.id];
    if (detail?.[record.field] !== record.source ||
      /\$[A-Za-z0-9{]/.test(record.translation)) {
      throw new Error(`${locale}: invalid direct Wowhead translation for ${record.id}`);
    }
    if (entries[record.id]?.[record.field]) continue;
    (entries[record.id] ??= {})[record.field] = record.translation;
    counts[{ r: "rank", d: "description", a: "aura", old: "old" }[record.field]]++;
  }
  const path = join(localeDir, `spell-tooltip-${locale}.json`);
  const output = JSON.stringify({ version: 1, clientBuild: build, locale, entries });
  if (reportOnly) {
    const gaps = { r: [], d: [], a: [], old: [] };
    for (const detail of details) {
      for (const field of Object.keys(gaps)) {
        if (detail[field] && (field !== "old" || detail.old !== detail.d) &&
          !entries[detail.id]?.[field] &&
          !(supplemental[field]?.[detail.id]?.source === detail[field] &&
            supplemental[field][detail.id].locales?.[locale])) gaps[field].push(detail.id);
      }
    }
    gapReport.locales[locale] = gaps;
  } else if (check) {
    if (await readFile(path, "utf8") !== output) {
      throw new Error(`${locale}: generated spell tooltip pack is stale`);
    }
  } else await writeFile(path, output);
  console.log(`${locale}: ${Object.keys(entries).length} spell records; ${counts.rank} ranks, ` +
    `${counts.description} descriptions, ${counts.aura} auras, ${counts.old} old descriptions` +
    `${reportOnly ? " reviewed" : check ? " checked" : " extracted"}`);
}
if (reportOnly) {
  gapReport.clientBuild = build;
  await writeFile(join(root, "data/site-research/spell-tooltip-post-review-gaps.json"),
    `${JSON.stringify(gapReport, null, 2)}\n`);
  for (const [locale, gaps] of Object.entries(gapReport.locales)) {
    console.log(`${locale}: remaining ${Object.entries(gaps)
      .map(([field, ids]) => `${field}=${ids.length}`).join(" ")}`);
  }
}
