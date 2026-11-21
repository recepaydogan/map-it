/** Build reviewed spell guide prose and resolve game terms from the installed client locale packs. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveClassGuideSpells, resolveGuideClassNames, resolveGuideItemNames,
  resolveGuideMapNames, resolveGuideRaceNames,
} from "./lib/class-guide-spell-terms.mjs";
import { description as capturedSpellDescription,
  hasEastAsianEnglishCarryover } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const check = process.argv.includes("--check");
const localeDirectory = "public/data/spells/writeups/locales";
const gameLocaleDirectory = "public/data/locales/wow-forever";
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const classIds = { druid: 11, hunter: 3, mage: 8, paladin: 2, priest: 5,
  rogue: 4, shaman: 7, warlock: 9, warrior: 1 };
const introductionPatterns = [
  ["simple", /^(.+) is new in Forever\.$/],
  ["noClassic", /^(.+) is new in Forever; there is no Classic Era version to compare it against\.$/],
  ["flagged", /^(.+) is flagged as new in Forever\.$/],
  ["flagged", /^The client flags (.+) as new in Forever\.$/],
  ["october", /^(.+) is new in Forever, added with the 1 October build\.$/],
];
const reviewed = await read("data/spell-writeup-localization/reviewed-prose.json");
const gameSource = await read(`${gameLocaleDirectory}/source.json`);
const available = new Set();
const newInForever = new Map();
for (const classId of ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"]) {
  const writeups = await read(`public/data/spells/writeups/${classId}.json`);
  for (const entry of [...Object.values(writeups.abilities ?? {}), ...Object.values(writeups.talents ?? {})]) {
    const introduction = introductionPatterns.map(([kind, pattern]) =>
      ({ kind, match: pattern.exec(entry.forever ?? "") })).find(({ match }) => match);
    if (introduction) {
      if (newInForever.has(entry.forever) && newInForever.get(entry.forever).classId !== classId) {
        throw new Error(`Ambiguous class for new Forever talent: ${entry.forever}`);
      }
      newInForever.set(entry.forever, {
        classId, name: introduction.match[1], kind: introduction.kind,
      });
    }
    for (const text of [entry.summary, entry.forever, ...(entry.details ?? []),
      ...(entry.useWhen ?? []), ...(entry.avoidWhen ?? [])]) {
      if (text) available.add(text);
    }
  }
}
if (reviewed.version !== 1 || !Array.isArray(reviewed.entries)) {
  throw new Error("Invalid reviewed spell write-up prose");
}
const seen = new Set();
const activeReviewed = reviewed.entries.filter((entry) => available.has(entry.en));
for (const entry of activeReviewed) {
  const sourceNumbers = (entry.en?.match(/\d+/g) ?? []).sort().join("|");
  if (typeof entry.en !== "string" || seen.has(entry.en) ||
    Object.keys(entry.locales ?? {}).sort().join("|") !== Object.keys(languages).sort().join("|") ||
    Object.entries(languages).some(([language]) => {
      const text = entry.locales[language];
      return typeof text !== "string" || !text.trim() || text === entry.en ||
        (text.replace(/\{\{[^{}]+\}\}/g, "")
          .replace(/\d{1,2}(?=\s*(?:월|月))/g, "")
          .match(/\d+/g) ?? []).sort().join("|") !== sourceNumbers;
    })) {
    throw new Error(`Invalid reviewed spell write-up translation: ${entry.en}`);
  }
  seen.add(entry.en);
}
const gameSourceIndex = new Map(gameSource.keys.map((key, index) => [key, index]));
const gamePacks = Object.fromEntries(await Promise.all(Object.entries(languages).map(
  async ([language, locale]) => [language, await read(`${gameLocaleDirectory}/${locale}.json`)])));
const spellIndex = await read("public/data/spells/foreverdb/index.json");
const localizedNameTemplates = {
  simple: {
    de: (name) => `Forever führt ${name} neu ein.`,
    es: (name) => `Forever añade ${name}.`,
    "es-MX": (name) => `Forever añade ${name}.`,
    fr: (name) => `Forever introduit ${name}.`,
    ko: (name) => `Forever에서 새롭게 추가된 것은 ${name}입니다.`,
    "pt-BR": (name) => `Forever adiciona ${name}.`,
    "zh-Hans": (name) => `Forever新增了${name}。`,
    "zh-Hant": (name) => `Forever新增了${name}。`,
  },
  noClassic: {
    de: (name) => `Forever führt ${name} neu ein; in Classic Era gab es keine vergleichbare Version.`,
    es: (name) => `Forever añade ${name}; en la Era Clásica no existía una versión equivalente.`,
    "es-MX": (name) => `Forever añade ${name}; en la Era Clásica no existía una versión equivalente.`,
    fr: (name) => `Forever introduit ${name} ; il n’existait pas de version équivalente dans l’ère classique.`,
    ko: (name) => `Forever에서 새롭게 추가된 것은 ${name}입니다. 클래식 시대에는 비교할 수 있는 기술이 없었습니다.`,
    "pt-BR": (name) => `Forever adiciona ${name}; não havia uma versão equivalente na Era Clássica.`,
    "zh-Hans": (name) => `Forever新增了${name}；经典旧世没有对应版本。`,
    "zh-Hant": (name) => `Forever新增了${name}；經典舊世沒有對應版本。`,
  },
  flagged: {
    de: (name) => `Im Client ist ${name} als neu in Forever markiert.`,
    es: (name) => `El cliente marca ${name} como novedad de Forever.`,
    "es-MX": (name) => `El cliente marca ${name} como novedad de Forever.`,
    fr: (name) => `Le client présente ${name} comme une nouveauté de Forever.`,
    ko: (name) => `게임 클라이언트에서 Forever 신규 항목으로 표시된 것은 ${name}입니다.`,
    "pt-BR": (name) => `O cliente marca ${name} como novidade de Forever.`,
    "zh-Hans": (name) => `游戏客户端将${name}标为Forever新增内容。`,
    "zh-Hant": (name) => `遊戲客戶端將${name}標為Forever新增內容。`,
  },
  october: {
    de: (name) => `Forever führte ${name} mit dem Build vom 1. Oktober neu ein.`,
    es: (name) => `Forever añadió ${name} con la versión del 1 de octubre.`,
    "es-MX": (name) => `Forever añadió ${name} con la versión del 1 de octubre.`,
    fr: (name) => `Forever a ajouté ${name} avec la version du 1er octobre.`,
    ko: (name) => `Forever의 시월 1일 빌드에 새로 추가된 항목은 ${name}입니다.`,
    "pt-BR": (name) => `Forever adicionou ${name} na versão de 1º de outubro.`,
    "zh-Hans": (name) => `Forever在十月1日版本中新增了${name}。`,
    "zh-Hant": (name) => `Forever在十月1日版本中新增了${name}。`,
  },
};
const generated = [];
for (const [english, { classId, name, kind }] of newInForever) {
  if (seen.has(english)) continue;
  const matchingNames = spellIndex.filter((row) => row[1] === name &&
    row[4] === classIds[classId]).flatMap((row) => {
    const index = gameSourceIndex.get(`SpellName:${row[0]}:0`);
    if (index === undefined || gameSource.values[index] !== name) return [];
    const translations = Object.fromEntries(Object.keys(languages).map((language) =>
      [language, gamePacks[language].values[index]]));
    if (Object.values(translations).some((value) => !value || value === name)) return [];
    return [translations];
  });
  if (new Set(matchingNames.map((translations) => JSON.stringify(translations))).size !== 1) continue;
  const names = matchingNames[0];
  if (!names) continue;
  generated.push({ en: english, locales: Object.fromEntries(Object.keys(languages).map(
    (language) => [language, localizedNameTemplates[kind][language](names[language])])) });
}
// Retain inactive review entries in the source file for later catalog revisions.
const spellDetails = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const spellTexts = new Map();
for (const [id, detail] of Object.entries(spellDetails)) {
  for (const field of ["d", "a", "old"]) {
    if (!detail[field]) continue;
    const matches = spellTexts.get(detail[field]) ?? [];
    matches.push([id, field]);
    spellTexts.set(detail[field], matches);
  }
}
const tooltipPacks = Object.fromEntries(await Promise.all(Object.entries(languages).map(
  async ([language, locale]) => [language, await read(
    `${gameLocaleDirectory}/spell-tooltip-${locale}.json`)])));
const numericSignature = (text) => (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
  .map((value) => value.replace(",", ".")).sort().join("|");
const generatedSources = new Set(generated.map((entry) => entry.en));
const exactSpellEntries = [];
for (const english of available) {
  if (seen.has(english) || generatedSources.has(english)) continue;
  const matches = spellTexts.get(english) ?? [];
  if (!matches.length) continue;
  const translations = Object.fromEntries(Object.keys(languages).map((language) => {
    const values = [...new Set(matches.map(([id, field]) =>
      tooltipPacks[language].entries[id]?.[field]).filter(Boolean))];
    return [language, values.length === 1 ? values[0] : undefined];
  }));
  if (Object.values(translations).some((value) => !value || value === english ||
    /\$[A-Za-z0-9{]/.test(value) ||
    numericSignature(value) !== numericSignature(english))) continue;
  exactSpellEntries.push({ en: english, locales: translations });
}
const classPacks = Object.fromEntries(await Promise.all(Object.keys(languages).map(
  async (language) => [language, await read(`public/data/classes/locales/${language}.json`)])));
const exactClassEntries = [];
const alreadyCovered = new Set([...seen, ...generatedSources,
  ...exactSpellEntries.map((entry) => entry.en)]);
for (const english of available) {
  if (alreadyCovered.has(english)) continue;
  const translations = Object.fromEntries(Object.keys(languages).map((language) =>
    [language, classPacks[language].translations[english]]));
  if (Object.values(translations).some((value) => !value || value === english ||
    /\$[A-Za-z0-9{]|\{\{[^{}]+\}\}|\[\[spell:/.test(value) ||
    numericSignature(value) !== numericSignature(english))) continue;
  exactClassEntries.push({ en: english, locales: translations });
}
for (const entry of exactClassEntries) alreadyCovered.add(entry.en);
const partialSpellEntries = [];
for (const english of available) {
  if (alreadyCovered.has(english)) continue;
  const matches = spellTexts.get(english) ?? [];
  if (!matches.length) continue;
  const translations = Object.fromEntries(Object.keys(languages).map((language) => {
    const values = [...new Set(matches.map(([id, field]) =>
      tooltipPacks[language].entries[id]?.[field]).filter(Boolean))];
    const value = values.length === 1 ? values[0] : undefined;
    return [language, value && value !== english &&
      !/\$[A-Za-z0-9{]|\{\{[^{}]+\}\}|\[\[spell:/.test(value) &&
      numericSignature(value) === numericSignature(english) ? value : english];
  }));
  if (Object.values(translations).every((value) => value === english)) continue;
  partialSpellEntries.push({ en: english, locales: translations });
}
const entries = [...activeReviewed, ...generated, ...exactSpellEntries,
  ...exactClassEntries, ...partialSpellEntries];
const partialSpellCounts = Object.fromEntries(Object.keys(languages).map((language) =>
  [language, partialSpellEntries.filter((entry) => entry.locales[language] !== entry.en).length]));
const entryByEnglish = new Map(entries.map((entry) => [entry.en, entry]));
const spellCaptures = new Map();
for (const [site, path] of [
  ["forever", "data/site-research/wowhead-locale-captures.jsonl"],
  ["classic", "data/site-research/wowhead-classic-locale-captures.jsonl"],
]) {
  for (const line of (await readFile(join(root, path), "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const capture = JSON.parse(line);
    if (capture.kind === "spell") {
      spellCaptures.set(`${site}:${capture.id}:${capture.locale}`, capture);
    }
  }
}
const captureLocales = { de: "de", es: "es", "es-MX": "mx", fr: "fr",
  ko: "ko", "pt-BR": "pt", "zh-Hans": "cn", "zh-Hant": "tw" };
const normalizedCaptureSource = (value) => value.normalize("NFKC")
  .replace(/\s+/gu, " ").trim();
const availableByNormalizedSource = new Map();
for (const english of available) {
  const normalized = normalizedCaptureSource(english);
  if (availableByNormalizedSource.has(normalized) &&
    availableByNormalizedSource.get(normalized) !== english) {
    availableByNormalizedSource.set(normalized, null);
  } else if (!availableByNormalizedSource.has(normalized)) {
    availableByNormalizedSource.set(normalized, english);
  }
}
const capturedIdsByEnglish = new Map();
for (const [key, capture] of spellCaptures) {
  if (!key.endsWith(":en")) continue;
  const capturedEnglish = capturedSpellDescription(capture);
  const english = capturedEnglish &&
    availableByNormalizedSource.get(normalizedCaptureSource(capturedEnglish));
  if (!english) continue;
  const ids = capturedIdsByEnglish.get(english) ?? [];
  ids.push(key.slice(0, -3));
  capturedIdsByEnglish.set(english, ids);
}
const capturedFieldCounts = Object.fromEntries(Object.keys(languages)
  .map((language) => [language, 0]));
for (const [english, ids] of capturedIdsByEnglish) {
  const translations = {};
  for (const [language, locale] of Object.entries(captureLocales)) {
    if (entryByEnglish.get(english)?.locales[language] !== undefined &&
      entryByEnglish.get(english).locales[language] !== english) continue;
    const values = [...new Set(ids.map((id) => spellCaptures.get(`${id}:${locale}`))
      .filter(Boolean).map(capturedSpellDescription)
      .filter((value) => value && value !== english &&
        !/\$[A-Za-z0-9{]|\{\{[^{}]+\}\}|\[\[spell:|\|1[^;]*;/.test(value) &&
        !hasEastAsianEnglishCarryover(value, languages[language]) &&
        numericSignature(value) === numericSignature(english)))];
    if (values.length === 1) translations[language] = values[0];
  }
  if (!Object.keys(translations).length) continue;
  let entry = entryByEnglish.get(english);
  if (!entry) {
    entry = { en: english, locales: Object.fromEntries(Object.keys(languages)
      .map((language) => [language, english])) };
    entries.push(entry);
    entryByEnglish.set(english, entry);
  }
  for (const [language, value] of Object.entries(translations)) {
    entry.locales[language] = value;
    capturedFieldCounts[language]++;
  }
}

async function output(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const absolute = join(root, path);
  if (check) {
    if (await readFile(absolute, "utf8") !== text) throw new Error(`Stale spell write-up locale: ${path}`);
  } else await writeFile(absolute, text);
}

await output(`${localeDirectory}/source.json`, { version: 1, strings: entries.map((entry) => entry.en) });
for (const [language, locale] of Object.entries(languages)) {
  const gamePack = gamePacks[language];
  if (gamePack.values.length !== gameSource.keys.length) throw new Error(`${locale}: client locale length mismatch`);
  const values = entries.map((entry) => {
    const original = entry.en;
    let text = entry.locales[language];
    text = resolveClassGuideSpells(text, original, new Map(), gameSource, gamePack);
    text = resolveGuideItemNames(text, original, gameSource, gamePack);
    text = resolveGuideClassNames(text, original, gameSource, gamePack);
    text = resolveGuideRaceNames(text, original, gameSource, gamePack);
    text = resolveGuideMapNames(text, original, gameSource, gamePack);
    text = text.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g,
      (_, key, english) => {
        const index = gameSourceIndex.get(key);
        const localized = gamePack.values[index];
        if (index === undefined || gameSource.values[index] !== english ||
          !original.includes(english) || !localized) {
          throw new Error(`${language}: unavailable spell guide client term: ${key}`);
        }
        return localized;
      });
    if (/\{\{[^{}]+\}\}/.test(text)) throw new Error(`${language}: unresolved guide term: ${original}`);
    return text.replace(/\[\[spell:[1-9]\d*\|([^\]\r\n]+)\]\]/g, "$1");
  });
  await output(`${localeDirectory}/${language}.json`, { version: 1, language, values });
  console.log(`${language}: ${activeReviewed.length} active reviewed, ${generated.length} ` +
    `same-ID game-named, ${exactSpellEntries.length} exact spell texts, ` +
    `${exactClassEntries.length} exact class descriptions, ` +
    `${partialSpellCounts[language]} ` +
    `partial spell texts, ${capturedFieldCounts[language]} captured tooltip fields` +
    `${check ? " checked" : " built"}`);
}
