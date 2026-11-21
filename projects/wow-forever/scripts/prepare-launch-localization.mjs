/** Inventory the current launch delta; reuse translations only for identical English. */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from "./lib/match-client-spell-resolved.mjs";

const dir = "data/site-research/wowhead-check-2026-11-04/localization";
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const before = (p) => JSON.parse(execFileSync("git", ["show", `HEAD:${p}`], { encoding: "utf8", maxBuffer: 30e6 }));
const calc = await read("public/data/classes/talent-calculator.json");
const shards = await Promise.all(Array.from({ length: 64 }, (_, n) => read(`public/data/spells/foreverdb/${n}.json`)));
const oldShards = await Promise.all(Array.from({ length: 64 }, async (_, n) => {
  const file = `public/data/spells/foreverdb/${n}.json`;
  return read(`data/site-research/wowhead-check-2026-11-04/before/${file}`).catch(() => shards[n]);
}));
const spells = Object.assign({}, ...shards);
const oldSpells = Object.assign({}, ...oldShards);
const source = await read("public/data/locales/wow-forever/source.json");
const sourceIndexes = new Map(source.keys.map((k, i) => [k, i]));
const native = Object.fromEntries(await Promise.all(["enUS", ...Object.values(languages)].map(async (locale) => [locale, await read(`${dir}/native-${locale}.json`)])));
const inventory = new Map();
const add = (text, kind, cls = "") => {
  if (typeof text !== "string" || !text.trim()) return;
  const entry = inventory.get(text) ?? { key: createHash("sha256").update(text).digest("hex").slice(0, 20), text, kinds: [], classes: [], translations: {}, origins: {} };
  if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
  if (cls && !entry.classes.includes(cls)) entry.classes.push(cls);
  inventory.set(text, entry); return entry;
};
const changedSpells = Object.values(spells).filter((s) => ["n", "d", "a", "r"].some((k) => s[k] !== oldSpells[s.id]?.[k]));
for (const s of changedSpells) {
  if (!s.cl && !calc.classes.some((c) => c.trees.some((t) => t.talents.some((a) => a.ranks.includes(s.id))))) continue;
  add(s.n, "name");
  for (const key of ["d", "a", "r"]) if (s[key] && s[key] !== oldSpells[s.id]?.[key]) add(s[key], `spell-${key}`);
}
for (const c of calc.classes) for (const tree of c.trees) for (const t of tree.talents) {
  add(t.n, "name", c.n);
  for (const d of t.d) add(d, "talent", c.n);
}
const catalog = await read("public/data/classes/catalog.json");
for (const c of catalog.classes) for (const a of [...c.trees.flatMap((t) => t.new), ...c.abilities.new]) add(a.description, "class-description", c.name);
const guideSource = await read("public/data/classes/guides/class-guides.json");
const stats = await read("public/data/classes/guides/stats.json");
const guideDelta = {};
const prose = new Set(["overview", "summary", "note", "forever", "why", "playstyle", "title", "notes", "battlegrounds", "world"]);
function collectProse(value, path = [], found = []) {
  if (typeof value === "string") {
    const last = path.at(-1), parent = path.at(-2);
    if (prose.has(last) || ["tips", "stats", "order", "why"].includes(parent) || path[0] === "stats" || last === "role" && path[0] === "play") found.push({ path, source: value });
  } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collectProse(v, [...path, k], found);
  return found;
}
const getAt = (object, parts) => parts.reduce((v, k) => v?.[k], object);
const oldGuideSource = before("public/data/classes/guides/class-guides.json");
for (const [name, guide] of Object.entries(guideSource.classes)) {
  const id = name.toLowerCase();
  const data = { guide, play: await read(`public/data/classes/guides/${id}-play.json`), builds: await read(`public/data/classes/guides/${id}-builds.json`), stats };
  const old = { guide: oldGuideSource.classes[name], play: before(`public/data/classes/guides/${id}-play.json`), builds: before(`public/data/classes/guides/${id}-builds.json`), stats };
  guideDelta[id] = { data, changed: collectProse(data).filter((e) => getAt(old, e.path) !== e.source) };
  for (const e of guideDelta[id].changed) add(e.source, "class-guide", name);
}
const writeupFields = ["summary", "forever", "details", "useWhen", "avoidWhen"];
for (const c of calc.classes) {
  const file = `public/data/spells/writeups/${c.n.toLowerCase()}.json`;
  const data = await read(file), old = before(file);
  for (const group of ["abilities", "talents"]) for (const [id, a] of Object.entries(data[group] ?? {})) for (const field of writeupFields) {
    const vals = Array.isArray(a[field]) ? a[field] : [a[field]];
    const oldVals = Array.isArray(old[group]?.[id]?.[field]) ? old[group][id][field] : [old[group]?.[id]?.[field]];
    for (const val of vals) if (val && !oldVals.includes(val)) add(val, "writeup", c.n);
  }
}
const enUi = await read("src/i18n/locales/en.json"); add(enUi.spells.retired, "ui");

const terms = {};
const numericSignature = (text) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", "."))).sort((a, b) => a - b).join("|");
for (const [lang, locale] of Object.entries(languages)) {
  const memory = new Map(), ambiguous = new Set();
  const remember = (en, text) => {
    if (!en || !text || en === text || ambiguous.has(en)) return;
    if (memory.has(en) && memory.get(en) !== text) { memory.delete(en); ambiguous.add(en); } else memory.set(en, text);
  };
  const pack = await read(`public/data/locales/wow-forever/${locale}.json`);
  source.keys.forEach((key, i) => { if (key.startsWith("SpellName:")) remember(source.values[i], pack.values[i]); });
  const talentPack = await read(`public/data/classes/locales/talents-${lang}.json`);
  for (const e of Object.values(talentPack.entries)) {
    if (e.name) remember(e.name.source, e.name.text);
    for (const r of Object.values(e.ranks ?? {})) remember(r.source, r.text);
  }
  const classPack = await read(`public/data/classes/locales/${lang}.json`);
  for (const [en, text] of Object.entries(classPack.translations)) remember(en, text);
  const writeupSource = await read("public/data/spells/writeups/locales/source.json");
  const writeupPack = await read(`public/data/spells/writeups/locales/${lang}.json`);
  writeupSource.strings.forEach((en, i) => remember(en, writeupPack.values[i]));
  for (const id of Object.keys(guideDelta)) {
    const p = await read(`public/data/classes/guides/locales/${lang}/${id}.json`);
    for (const e of p.edits) remember(e.source, e.text);
  }
  const tooltips = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
  for (const [id, fields] of Object.entries(tooltips.entries)) for (const key of ["d", "a", "r"]) remember(oldSpells[id]?.[key], fields[key]);
  terms[lang] = {};
  for (const [id, n] of Object.entries(native.enUS.spells)) {
    const translated = native[locale].spells[id];
    if (!translated?.name || !n.name || n.name === translated.name) continue;
    terms[lang][n.name] ??= translated.name;
  }
  for (const entry of inventory.values()) {
    if (memory.has(entry.text)) { entry.translations[lang] = memory.get(entry.text); entry.origins[lang] = "existing-exact-English"; }
    if (entry.kinds.includes("name") && terms[lang][entry.text]) { entry.translations[lang] = terms[lang][entry.text]; entry.origins[lang] = "Blizzard-70790-name"; }
  }
  for (const [id, n] of Object.entries(native.enUS.spells)) {
    const translated = native[locale].spells[id];
    if (!translated) continue;
    const s = spells[id];
    if (!s || n.name !== s.n) continue;
    const candidates = [s.d, s.a, ...calc.classes.flatMap((c) => c.trees.flatMap((t) => t.talents.filter((a) => a.ranks.includes(Number(id))).flatMap((a) => a.d)))].filter(Boolean);
    for (const en of candidates) {
      const entry = inventory.get(en); if (!entry) continue;
      for (const index of [1, 2]) {
        const values = n.fields[index] && matchLinkedSpellTemplate(n.fields[index], en);
        if (values === undefined || !translated.fields[index]) continue;
        const text = renderResolvedSpellTemplate(translated.fields[index], values, locale, en);
        if (text && text !== en && !/\$[A-Za-z?{]/.test(text) && numericSignature(text) === numericSignature(en)) {
          entry.translations[lang] = text; entry.origins[lang] = "Blizzard-70790-template";
        }
      }
    }
  }
}
await writeFile(`${dir}/inventory.json`, `${JSON.stringify({ version: 1, languages, changedSpellIds: changedSpells.map((s) => s.id), entries: [...inventory.values()], terms }, null, 2)}\n`);
await writeFile(`${dir}/guide-delta.json`, `${JSON.stringify(guideDelta)}\n`);
console.log(JSON.stringify({ entries: inventory.size, pending: Object.fromEntries(Object.keys(languages).map((l) => [l, [...inventory.values()].filter((e) => !e.translations[l]).length])), estimatedPendingCharacters: [...inventory.values()].reduce((n, e) => n + Object.keys(languages).filter((l) => !e.translations[l]).length * e.text.length, 0) }));
