/** Validate reviewed spell guide prose and consume a new translation batch. */
import fs from 'node:fs';
import {
  resolveClassGuideSpells,
  resolveGuideClassNames,
  resolveGuideItemNames,
  resolveGuideMapNames,
  resolveGuideRaceNames,
  resolveKoreanGuideParticles,
} from './lib/class-guide-spell-terms.mjs';

const apply = process.argv.includes('--apply');
if (process.argv.length !== (apply ? 3 : 2)) {
  throw new Error('Use --apply or no arguments');
}

const reviewedPath = 'data/spell-writeup-localization/reviewed-prose.json';
const batchPath = 'data/spell-writeup-localization/next-batch-temp.json';
const tabularPath = 'data/spell-writeup-localization/next-batch-temp.tsv';
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const localeCodes = {
  de: 'deDE', es: 'esES', 'es-MX': 'esMX', fr: 'frFR',
  ko: 'koKR', 'pt-BR': 'ptBR', 'zh-Hans': 'zhCN', 'zh-Hant': 'zhTW',
};
const localeKeys = Object.keys(localeCodes).sort();
const reviewed = read(reviewedPath);
const active = new Set();

for (const classId of [
  'druid', 'hunter', 'mage', 'paladin', 'priest',
  'rogue', 'shaman', 'warlock', 'warrior',
]) {
  const writeups = read(`public/data/spells/writeups/${classId}.json`);
  for (const entry of [
    ...Object.values(writeups.abilities ?? {}),
    ...Object.values(writeups.talents ?? {}),
  ]) {
    for (const field of ['summary', 'forever', 'details', 'useWhen', 'avoidWhen']) {
      const value = entry[field];
      for (const text of typeof value === 'string' ? [value] : value ?? []) {
        if (typeof text === 'string' && text) active.add(text);
      }
    }
  }
}

const numbers = (text) => [...text.matchAll(/\d+(?:[.,]\d+)?/g)]
  .map(([number]) => number.replace(',', '.')).sort();
const stripTokens = (text) => text.replace(/\{\{[^{}]+\}\}/g, '');
const seen = new Set();
const check = (entry) => {
  if (typeof entry?.en !== 'string' || !active.has(entry.en) || seen.has(entry.en)) {
    throw new Error(`Missing or duplicate English source: ${entry?.en}`);
  }
  seen.add(entry.en);
  if (Object.keys(entry.locales ?? {}).sort().join('|') !== localeKeys.join('|')) {
    throw new Error(`Incomplete locales: ${entry.en}`);
  }
  for (const [locale, text] of Object.entries(entry.locales)) {
    if (typeof text !== 'string' || !text.trim() || text === entry.en) {
      throw new Error(`Empty or English translation: ${locale} ${entry.en}`);
    }
    const normalized = text
      .replaceAll('9월', entry.en.includes('September') ? 'September' : '9월')
      .replaceAll('10월', entry.en.includes('October') ? 'October' : '10월')
      .replace(/10\s*月/g, entry.en.includes('October') ? 'October' : '$&');
    if (numbers(stripTokens(normalized)).join('|') !== numbers(entry.en).join('|')) {
      throw new Error(`Number mismatch: ${locale} ${entry.en}`);
    }
  }
};

for (const entry of reviewed.entries) check(entry);
if (!apply) {
  console.log(`reviewed=${seen.size} total=${active.size} remaining=${active.size - seen.size}`);
  process.exit(0);
}

if (fs.existsSync(batchPath) && fs.existsSync(tabularPath)) {
  throw new Error('Keep only one pending batch format');
}
const stagingPath = fs.existsSync(tabularPath) ? tabularPath : batchPath;
const batch = stagingPath === tabularPath
  ? fs.readFileSync(tabularPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(Boolean).map((line, index) => {
      const fields = line.split('\t');
      if (fields.length !== 8) throw new Error(`Batch row ${index + 1} needs 8 fields`);
      const [en, de, es, fr, ko, ptBR, zhHans, zhHant] = fields;
      return { en, locales: { de, es, fr, ko, 'pt-BR': ptBR,
        'zh-Hans': zhHans, 'zh-Hant': zhHant } };
    })
  : read(batchPath);
if (!Array.isArray(batch) || batch.length === 0) throw new Error('Empty batch');
const gameSource = read('public/data/locales/wow-forever/source.json');
const packs = Object.fromEntries(Object.values(localeCodes).map((code) =>
  [code, read(`public/data/locales/wow-forever/${code}.json`)]));
let koreanFixes = 0;

for (const entry of batch) {
  entry.locales ??= {};
  entry.locales['es-MX'] ??= entry.locales.es;
  check(entry);
  for (const [locale, code] of Object.entries(localeCodes)) {
    const pack = packs[code];
    const resolve = (text) => {
      let value = resolveClassGuideSpells(text, entry.en, new Map(), gameSource, pack);
      value = resolveGuideItemNames(value, entry.en, gameSource, pack);
      value = resolveGuideMapNames(value, entry.en, gameSource, pack);
      value = resolveGuideRaceNames(value, entry.en, gameSource, pack);
      return resolveGuideClassNames(value, entry.en, gameSource, pack);
    };
    if (locale === 'ko') {
      const fixed = resolveKoreanGuideParticles(entry.locales.ko, resolve);
      if (fixed !== entry.locales.ko) {
        entry.locales.ko = fixed;
        koreanFixes++;
      }
    }
    if (resolve(entry.locales[locale]).includes('{{')) {
      throw new Error(`Unresolved term: ${locale} ${entry.en}`);
    }
  }
}

reviewed.entries.push(...batch);
fs.writeFileSync(reviewedPath, `${JSON.stringify(reviewed, null, 2)}\n`);
fs.unlinkSync(stagingPath);
console.log(`added=${batch.length} reviewed=${reviewed.entries.length} total=${active.size}` +
  ` remaining=${active.size - reviewed.entries.length} koreanFixes=${koreanFixes}`);
