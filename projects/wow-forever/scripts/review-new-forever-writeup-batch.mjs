/** Review repeated guide prose while resolving skill names from the installed client. */
import fs from 'node:fs';

const apply = process.argv.includes('--apply');
if (process.argv.length > (apply ? 3 : 2)) throw new Error('Use --apply or no arguments');
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const reviewedPath = 'data/spell-writeup-localization/reviewed-prose.json';
const source = read('public/data/spells/writeups/locales/source.json').strings;
const reviewed = read(reviewedPath);
const gameSource = read('public/data/locales/wow-forever/source.json');
const locales = ['de', 'es', 'es-MX', 'fr', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant'];
const gameLocales = ['deDE', 'esES', 'esMX', 'frFR', 'koKR', 'ptBR', 'zhCN', 'zhTW'];
const gameNames = Object.fromEntries(gameLocales.map((code) =>
  [code, read(`public/data/locales/wow-forever/${code}.json`)]));
const existing = new Set(reviewed.entries.map((entry) => entry.en));
const active = new Set();
for (const classId of ['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']) {
  const writeups = read(`public/data/spells/writeups/${classId}.json`);
  for (const entry of [...Object.values(writeups.abilities ?? {}), ...Object.values(writeups.talents ?? {})]) {
    for (const text of [entry.summary, entry.forever, ...(entry.details ?? []),
      ...(entry.avoidWhen ?? []), ...(entry.useWhen ?? [])]) {
      if (text) active.add(text);
    }
  }
}

const candidates = source.filter((text) => !existing.has(text) && active.has(text));
if (candidates.length !== 48) throw new Error(`Expected 48 active source strings, found ${candidates.length}`);
const parse = (text) => {
  let match = text.match(/^(.+?) is new in Forever; there is no Classic Era version to compare it against\.$/);
  if (match) return { name: match[1], kind: 'classic' };
  match = text.match(/^(.+?) is flagged as new in Forever\.$/) ??
    text.match(/^The client flags (.+?) as new in Forever\.$/);
  if (match) return { name: match[1], kind: 'flagged' };
  match = text.match(/^(.+?) is new in Forever\.$/);
  if (match) return { name: match[1], kind: 'plain' };
  throw new Error(`Unrecognized guide sentence: ${text}`);
};

const prose = {
  de: {
    plain: (name) => `${name} ist neu in Forever.`,
    flagged: (name) => `Der Client kennzeichnet ${name} als neu in Forever.`,
    classic: (name) => `${name} ist neu in Forever; eine entsprechende Version in Classic Era gibt es nicht.`,
  },
  es: {
    plain: (name) => `${name} es una novedad de Forever.`,
    flagged: (name) => `El cliente marca ${name} como novedad de Forever.`,
    classic: (name) => `${name} es una novedad de Forever; no hay una versión de la Era Clásica para comparar.`,
  },
  'es-MX': {
    plain: (name) => `${name} es una novedad de Forever.`,
    flagged: (name) => `El cliente marca ${name} como novedad de Forever.`,
    classic: (name) => `${name} es una novedad de Forever; no hay una versión de la Era Clásica para comparar.`,
  },
  fr: {
    plain: (name) => `${name} est une nouveauté de Forever.`,
    flagged: (name) => `Le client présente ${name} comme une nouveauté de Forever.`,
    classic: (name) => `${name} est une nouveauté de Forever ; aucune version de l’ère classique ne permet de faire une comparaison.`,
  },
  ko: {
    plain: (name) => `Forever에 ${name}라는 신규 요소가 추가되었습니다.`,
    flagged: (name) => `클라이언트는 Forever 신규 항목으로 ${name} 항목을 표시합니다.`,
    classic: (name) => `Forever에 ${name}라는 신규 요소가 추가되었으며, 비교할 클래식 시대 버전이 없습니다.`,
  },
  'pt-BR': {
    plain: (name) => `${name} é novidade em Forever.`,
    flagged: (name) => `O cliente indica ${name} como novidade de Forever.`,
    classic: (name) => `${name} é novidade em Forever; não há uma versão da Era Clássica para comparação.`,
  },
  'zh-Hans': {
    plain: (name) => `${name}是Forever新增的内容。`,
    flagged: (name) => `游戏客户端将${name}标记为Forever新增内容。`,
    classic: (name) => `${name}是Forever新增的内容，没有可供对比的经典旧世版本。`,
  },
  'zh-Hant': {
    plain: (name) => `${name}是Forever新增的內容。`,
    flagged: (name) => `遊戲用戶端將${name}標記為Forever新增內容。`,
    classic: (name) => `${name}是Forever新增的內容，沒有可供對比的經典舊世版本。`,
  },
};

const added = [];
for (const text of candidates) {
  const { name, kind } = parse(text);
  const hits = gameSource.values.flatMap((value, index) =>
    value === name && /^SpellName:\d+:0$/.test(gameSource.keys[index])
      ? [{ key: gameSource.keys[index], index, id: Number(gameSource.keys[index].split(':')[1]) }]
      : []);
  if (!hits.length) throw new Error(`No client spell name for ${name}`);
  const preferred = hits.filter((hit) => hit.id >= 1_000_000).sort((a, b) => a.id - b.id)[0] ?? hits[0];
  const token = `{{CLIENT:${preferred.key}|${name}}}`;
  const translations = {};
  for (let index = 0; index < locales.length; index++) {
    const localizedName = gameNames[gameLocales[index]].values[preferred.index];
    if (!localizedName) throw new Error(`Missing ${gameLocales[index]} client name for ${name}`);
    translations[locales[index]] = prose[locales[index]][kind](token);
    if (!translations[locales[index]].includes(token)) throw new Error(`Name lost in ${text}`);
  }
  added.push({ en: text, locales: translations });
}

if (apply) {
  reviewed.entries.push(...added);
  fs.writeFileSync(reviewedPath, `${JSON.stringify(reviewed, null, 2)}\n`);
}
console.log(`${apply ? 'Added' : 'Ready'} ${added.length} guide strings / ${added.length * locales.length} locale records`);
for (const kind of ['plain', 'flagged', 'classic']) {
  const sample = added.find((entry) => parse(entry.en).kind === kind);
  if (sample) console.log(kind, JSON.stringify({ en: sample.en, de: sample.locales.de, ko: sample.locales.ko }));
}
