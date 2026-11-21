import fs from 'node:fs';
import path from 'node:path';
import { classSpellIds } from './lib/class-guide-spell-terms.mjs';

const classId = process.argv.find((arg) => arg.startsWith('--class='))?.split('=')[1];
const spec = process.argv.find((arg) => arg.startsWith('--spec='))?.split('=')[1];
const section = process.argv.find((arg) => arg.startsWith('--section='))?.split('=')[1] ?? 'builds';
const subsection = process.argv.find((arg) => arg.startsWith('--subsection='))?.split('=')[1];
const fieldFilter = process.argv.find((arg) => arg.startsWith('--field='))?.split('=')[1];
const reviseAmbiguous = process.argv.includes('--revise-ambiguous');
if (!classId || !spec || !process.env.DEEPL_API_KEY?.endsWith(':fx')) {
  throw new Error('Usage: --class=<id> --spec=<name> [--section=guide|play|builds] with a DeepL Free API key');
}

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const catalog = read(`data/class-guide-localization/${classId}.json`);
const build = section === 'builds' ? read(`public/data/classes/guides/${classId}-builds.json`) : null;
const play = section === 'play' ? read(`public/data/classes/guides/${classId}-play.json`) : null;
const metadata = read('public/data/spells/foreverdb/classes.json').find((item) => item.n.toLowerCase() === classId);
const guide = section === 'guide' ? read('public/data/classes/guides/class-guides.json').classes[metadata?.n] : null;
const guideIndex = guide?.specs.findIndex((item) => item.tree === spec) ?? -1;
if (!metadata || section === 'builds' && !build.specs[spec] || section === 'play' && !play.specs[spec] ||
  section === 'guide' && guideIndex < 0 || !['guide', 'play', 'builds'].includes(section) ||
  subsection && section !== 'play' || subsection && !play?.specs[spec]?.[subsection]) {
  throw new Error(`Unknown class/spec/section: ${classId}/${spec}/${section}`);
}
const clientSource = read('public/data/locales/wow-forever/source.json');
const spellIds = classSpellIds(metadata);
const terms = [...spellIds.entries()]
  .filter(([name, id]) => clientSource.values[clientSource.keys.indexOf(`SpellName:${id}:0`)] === name)
  .map(([name]) => ({ name, token: `{{SPELL:${name}}}` }));
for (const [name, id, otherClass] of [['Polymorph', 118, 'mage'], ['Fear', 5782, 'warlock']]) {
  if (clientSource.values[clientSource.keys.indexOf(`SpellName:${id}:0`)] === name) {
    terms.push({ name, token: `{{SPELL@${otherClass}:${name}}}` });
  }
}
for (const [name, id] of [['Call of Thunder', 16120], ['Serpent Sting', 1978], ['Immolate', 348], ['Searing Pain', 5676], ['Entangling Roots', 339]]) {
  if (clientSource.values[clientSource.keys.indexOf(`SpellName:${id}:0`)] === name) {
    terms.push({ name, token: `{{CLIENT:SpellName:${id}:0|${name}}}` });
  }
}
terms.sort((a, b) => b.name.length - a.name.length);

const editedPaths = new Set(catalog.edits.map((edit) => JSON.stringify(edit.path)));
const translatedNotes = new Set(catalog.notes.map((note) => note.source));
const entries = [];
function collect(value, parts) {
  if (typeof value === 'string') {
    const field = parts.at(-1);
    if (['summary', 'role', 'playstyle', 'note', 'notes', 'forever', 'battlegrounds', 'world'].includes(field) || parts.includes('why') ||
      parts.at(-2) === 'tips') {
      if (!editedPaths.has(JSON.stringify(parts)) && !(field === 'note' && translatedNotes.has(value))) {
        entries.push({ path: parts, source: value });
      }
    }
    return;
  }
  if (Array.isArray(value)) value.forEach((child, index) => collect(child, [...parts, index]));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => collect(child, [...parts, key]));
}
if (section === 'builds') collect(build.specs[spec], ['builds', 'specs', spec]);
else if (section === 'play' && subsection) collect(play.specs[spec][subsection], ['play', 'specs', spec, subsection]);
else if (section === 'play') collect(play.specs[spec], ['play', 'specs', spec]);
else collect(guide.specs[guideIndex], ['guide', 'specs', guideIndex]);
const unique = [...new Map(entries.map((entry) => [entry.source, entry])).values()];
const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function markTerms(source) {
  const spans = [];
  for (const term of terms) {
    let start = 0;
    while ((start = source.indexOf(term.name, start)) !== -1) {
      const end = start + term.name.length;
      if (!/[A-Za-z]/.test(source[start - 1] ?? '') && !/[A-Za-z]/.test(source[end] ?? '') &&
        !spans.some((span) => start < span.end && end > span.start)) spans.push({ start, end, term });
      start = end;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const tokens = [];
  let marked = '';
  let cursor = 0;
  for (const span of spans) {
    marked += escapeXml(source.slice(cursor, span.start));
    marked += `<g id="${tokens.length}">${escapeXml(span.term.name)}</g>`;
    tokens.push(span.term.token);
    cursor = span.end;
  }
  marked += escapeXml(source.slice(cursor));
  return { marked, tokens };
}
function restoreTerms(translated, tokens) {
  const seen = new Set();
  const restored = translated.replace(/<g id="(\d+)">[^<]*<\/g>/g, (_, rawId) => {
    const id = Number(rawId);
    if (!tokens[id] || seen.has(id)) throw new Error(`Unexpected protected term ${rawId}`);
    seen.add(id);
    return tokens[id];
  });
  if ([...new Set(tokens)].some((token) => ![...seen].some((id) => tokens[id] === token)) || /<\/?g\b/.test(restored)) {
    throw new Error('Lost protected game term');
  }
  return restored.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').trim();
}

function clarify(source) {
  return source
    .replace(/^The two points left over in tier 1: at 2\/5 /i,
      'Put the two remaining points in the first row of the talent tree into this talent. With 2 of 5 ranks invested in this talent, ')
    .replace(/^The two spare tier 1 points: at 2\/5 /i,
      'Put the two remaining points in the first row of the talent tree into this talent. With 2 of 5 ranks invested in this talent, ')
    .replace(/^At (\d+)\/(\d+) /, 'With $1 of $2 ranks invested in this talent, ')
    .replace(/damaging attacks push back your (Lightning Bolt) (\d+)% less/g,
      'damage you take delays the casting of your $1 $2% less')
    .replace(/^On cooldown\b/i, 'Use this ability whenever its cooldown finishes')
    .replace(/\bon cooldown\b/gi, 'whenever its cooldown has finished');
}
const selected = unique.map((entry, index) => ({ ...entry, index }))
  .filter((entry) => (!reviseAmbiguous || /^(At \d+\/\d+|The two (?:points left over|spare tier 1 points))|on cooldown|Call of Thunder|Serpent Sting|Immolate|Searing Pain|Entangling Roots/i.test(entry.source)) &&
    (!fieldFilter || entry.path.slice(-fieldFilter.split('.').length).join('.') === fieldFilter) &&
    (!process.argv.includes('--notes-only') || entry.path.at(-1) === 'note'));
const prepared = selected.map(({ source }) => markTerms(reviseAmbiguous ? clarify(source) : source));
if (process.argv.includes('--estimate')) {
  console.log(`${selected.length} segments, ${prepared.reduce((sum, item) => sum + item.marked.length, 0)} input characters per language`);
  process.exit(0);
}
const targetLanguages = {
  de: 'DE', es: 'ES-ES', 'es-MX': 'ES-419', fr: 'FR', ko: 'KO',
  'pt-BR': 'PT-BR', 'zh-Hans': 'ZH-HANS', 'zh-Hant': 'ZH-HANT',
};
const scope = section === 'builds' ? '' : `${section}-`;
const suffix = [subsection, fieldFilter?.replaceAll('.', '-')].filter(Boolean).join('-');
const draftPath = path.join(root, 'data/class-guide-localization/drafts', `${classId}-${scope}${spec.toLowerCase()}${suffix ? '-' + suffix : ''}.json`);
fs.mkdirSync(path.dirname(draftPath), { recursive: true });
const overridePath = draftPath.replace(/\.json$/, '-overrides.json');
const overrides = fs.existsSync(overridePath) ? JSON.parse(fs.readFileSync(overridePath, 'utf8')) : {};
const draft = fs.existsSync(draftPath) ? JSON.parse(fs.readFileSync(draftPath, 'utf8')) : { entries: unique.map(({ source }) => ({ source, translations: {} })) };
if (draft.entries.length !== unique.length || draft.entries.some((entry, i) => entry.source !== unique[i].source)) {
  throw new Error('Existing draft inventory changed; review before rerunning');
}
const key = process.env.DEEPL_API_KEY;
for (const [locale, target_lang] of Object.entries(targetLanguages)) {
  if (!reviseAmbiguous && draft.entries.every((entry) => entry.translations[locale])) continue;
  if (reviseAmbiguous && draft.revisedLanguages?.includes(locale)) continue;
  const rawPath = draftPath + `${reviseAmbiguous ? '.revise' : ''}.${locale}.raw.json`;
  let result;
  if (fs.existsSync(rawPath)) result = { translations: JSON.parse(fs.readFileSync(rawPath, 'utf8')) };
  else {
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: prepared.map((item) => item.marked), source_lang: 'EN', target_lang,
        tag_handling: 'xml', tag_handling_version: 'v2', ignore_tags: ['g'],
        context: `World of Warcraft Forever ${metadata.n} ${spec} class guide. Tier means talent tree row. Spell and talent names inside XML g tags are exact game names. Translate level, cooldown, mana, damage, crowd control, PvP and dungeon mechanics accurately. Address the player directly.`,
      }),
    });
    if (!response.ok) throw new Error(`${locale}: DeepL HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    result = await response.json();
  }
  if (result.translations?.length !== selected.length) throw new Error(`${locale}: Unexpected translation count`);
  for (const [requestIndex, translated] of result.translations.entries()) {
    const index = selected[requestIndex].index;
    try {
      draft.entries[index].translations[locale] = overrides[locale]?.[index] ?? restoreTerms(translated.text, prepared[requestIndex].tokens);
    } catch (error) {
      fs.writeFileSync(rawPath, JSON.stringify(result.translations, null, 2) + '\n');
      throw new Error(`${locale} segment ${index}: ${error.message}; raw response saved`);
    }
  }
  fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n');
  if (reviseAmbiguous) {
    draft.revisedLanguages ??= [];
    draft.revisedLanguages.push(locale);
    fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n');
  }
  if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
  console.log(`${locale}: ${selected.length} draft segments`);
}
console.log(`Draft saved: ${path.relative(root, draftPath)}`);
