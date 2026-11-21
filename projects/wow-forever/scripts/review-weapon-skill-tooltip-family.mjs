import fs from 'node:fs';

const apply = process.argv.includes('--apply');
const fallbackPath = 'data/site-research/client-wowhead-fallback.json';
const reviewedPath = 'data/spell-tooltip-localization/reviewed-overrides.json';
const localePath = 'public/data/locales/wow-forever';
const localeCodes = ['deDE', 'esES', 'esMX', 'frFR', 'koKR', 'ptBR', 'zhCN', 'zhTW'];
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

const phrasing = {
  deDE: {
    first: (name) => `Eure Fertigkeit „${name}“ beträgt <Waffenfertigkeit>/150.`,
    varies: '<abhängig von Eurer Waffenfertigkeit>',
    note: '(Werte für Stufe 30; sie steigen mit Eurer Stufe.)',
  },
  esES: {
    first: (name) => `Tienes <habilidad con armas>/150 puntos de habilidad con ${name}.`,
    varies: '<varía según tu habilidad con armas>',
    note: '(Valores para el nivel 30; aumentan con tu nivel.)',
  },
  esMX: {
    first: (name) => `Tienes <habilidad con armas>/150 de habilidad con ${name}.`,
    varies: '<varía según tu habilidad con armas>',
    note: '(Valores para el nivel 30; aumentan con tu nivel.)',
  },
  frFR: {
    first: (name) => `Votre compétence « ${name} » est de <maîtrise de l’arme>/150.`,
    varies: '<varie selon votre maîtrise de l’arme>',
    note: '(Valeurs au niveau 30 ; elles augmentent avec votre niveau.)',
  },
  koKR: {
    first: (name) => `현재 ${name} 숙련도는 <무기 숙련도>/150입니다.`,
    varies: '<무기 숙련도에 따라 달라짐>',
    note: '(30 레벨 기준 수치이며, 레벨이 오르면 증가합니다.)',
  },
  ptBR: {
    first: (name) => `Sua perícia em ${name} é de <perícia com arma>/150.`,
    varies: '<varia conforme sua perícia com arma>',
    note: '(Valores no nível 30; aumentam com seu nível.)',
  },
  zhCN: {
    first: (name) => `你的${name}技能为<武器技能>/150。`,
    varies: '<随你的武器技能变化>',
    note: '（数值以30级为准，并随你的等级提升。）',
  },
  zhTW: {
    first: (name) => `你的${name}技能為<武器技能>/150。`,
    varies: '<依你的武器技能而變化>',
    note: '（數值以30級為準，並隨你的等級提升。）',
  },
};

const fallback = readJson(fallbackPath);
const reviewed = readJson(reviewedPath);
const sourceNames = readJson(`${localePath}/source.json`);
const names = Object.fromEntries(localeCodes.map((code) => [code, readJson(`${localePath}/${code}.json`)]));
const rows = fallback.records.filter((row) => row.source.startsWith('You have <your weapon skill>/150 skill in '));
if (rows.length !== 17) throw new Error(`Expected 17 weapon skill spells, found ${rows.length}`);

let added = 0;
for (const row of rows) {
  if (reviewed.spells[row.id]) throw new Error(`Spell ${row.id} already reviewed`);
  if (!/^You have <your weapon skill>\/150 skill in [^.]+\.\n\nLevel 30 target:\n/.test(row.source)) {
    throw new Error(`Unexpected ForeverDB source for ${row.id}`);
  }
  const nameIndex = sourceNames.keys.indexOf(`SpellName:${row.id}:0`);
  if (nameIndex < 0) throw new Error(`Missing client spell name for ${row.id}`);
  const fields = row.source.includes('Glancing Blow Penalty:') ? ['hdp', 'cr', 'gp', 'gc'] : ['hdp', 'cr'];
  if (row.source.split('\n').length !== fields.length + 4) throw new Error(`Unexpected source fields for ${row.id}`);
  const locales = {};
  for (const code of localeCodes) {
    const name = names[code].values[nameIndex];
    const raw = row.locales[code]?.template;
    if (!name || !raw?.includes('$@expandkey[')) throw new Error(`Missing client evidence for ${row.id}/${code}`);
    const head = raw.split('$@expandkey[')[0].replaceAll('\r\n', '\n').trim();
    const lines = head.split('\n');
    if (lines.length !== fields.length + 3 || lines[1] !== '') {
      throw new Error(`Unexpected client structure for ${row.id}/${code}: ${lines.length} lines`);
    }
    if (!lines[0].includes(`$@spellname${row.id}`) || !/\$sk\d+\/\$<sc>/.test(lines[0])) {
      throw new Error(`Unexpected client skill/name formula for ${row.id}/${code}`);
    }
    let heading = lines[2].replaceAll('$PL', '30').trim();
    if (!heading.endsWith(':') && !heading.endsWith('：')) heading += ':';
    const translatedFields = lines.slice(3).map((line, index) => {
      const field = fields[index];
      const formula = new RegExp(`\\$\\{\\$<${field}>\\}(?:\\.1)?[\\u00a0 ]*%`);
      if (!formula.test(line)) throw new Error(`Unexpected ${field} formula for ${row.id}/${code}: ${line}`);
      return line.replace(formula, phrasing[code].varies).trim();
    });
    const translation = `${phrasing[code].first(name)}\n\n${heading}\n${translatedFields.join('\n')}\n${phrasing[code].note}`;
    if (translation.includes('$') || translation.includes('undefined')) throw new Error(`Unresolved formula in ${row.id}/${code}`);
    if (!translation.includes('/150') || !translation.includes('30') || !translation.includes(name)) {
      throw new Error(`Missing source detail in ${row.id}/${code}`);
    }
    locales[code] = translation;
    added++;
  }
  reviewed.spells[row.id] = {
    source: row.source,
    locales,
    evidence: `installed-client:Spell:${row.id}`,
    correctionBasis: Object.fromEntries(localeCodes.map((code) => [code,
      'Same-ID installed-client spell name and skill-stat labels; dynamic client formulas adapted to the fixed level-30 ForeverDB source, with the level-growth note translated in context.'
    ])),
  };
}

if (apply) fs.writeFileSync(reviewedPath, `${JSON.stringify(reviewed, null, 2)}\n`);
console.log(`${apply ? 'Added' : 'Ready'} ${rows.length} spells / ${added} locale records`);
console.log('Sample:', JSON.stringify({ id: rows[0].id, deDE: reviewed.spells[rows[0].id].locales.deDE }));
