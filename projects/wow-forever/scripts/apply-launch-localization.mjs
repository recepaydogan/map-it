/** Apply reviewed launch translations without touching quest or marker importer output. */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { applyClassGuideText } from "../src/features/classes/class-guide-localization.ts";
import { localizeTalentCatalog } from "../src/features/classes/talent-catalog-localization.ts";
import { resolveKoreanGuideParticles } from "./lib/class-guide-spell-terms.mjs";

const directory = "data/site-research/wowhead-check-2026-11-04/localization";
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const inventory = await read(`${directory}/inventory.json`);
const byText = new Map(inventory.entries.map((e) => [e.text, e]));
const overrides = await read(`${directory}/reviewed-overrides.json`).catch(() => ({}));
for (const e of inventory.entries) for (const language of Object.keys(inventory.languages)) {
  const override = overrides[language]?.[e.key];
  if (override) { e.translations[language] = override; e.origins[language] = "explicit-context-review"; }
  if (!e.translations[language]?.trim()) throw new Error(`Pending translation: ${language}/${e.key}`);
}
const translation = (text, language) => {
  const entry = byText.get(text);
  if (!entry?.translations[language]) throw new Error(`Uninventoried current source: ${language}/${text.slice(0, 100)}`);
  return entry.translations[language];
};
const outputs = new Map();
outputs.set("src/i18n/locales/en.json", await read("src/i18n/locales/en.json"));
const classMetadata = await read("public/data/spells/foreverdb/classes.json");
const calc = await read("public/data/classes/talent-calculator.json");
const source = await read("public/data/locales/wow-forever/source.json");
const originalSourceLength = source.keys.length;
const sourceIndexes = new Map(source.keys.map((key, i) => [key, i]));
const spells = Object.assign({}, ...await Promise.all(Array.from({ length: 64 }, (_, i) => read(`public/data/spells/foreverdb/${i}.json`))));
const changed = inventory.changedSpellIds.map((id) => spells[id]).filter((s) => s && byText.has(s.n));
const nameUpdates = [];
for (const s of changed) {
  const key = `SpellName:${s.id}:0`;
  let i = sourceIndexes.get(key);
  if (i === undefined) { i = source.keys.length; sourceIndexes.set(key, i); source.keys.push(key); source.values.push(s.n); }
  if (source.values[i] !== s.n || i >= originalSourceLength) nameUpdates.push([i, s.n]);
  source.values[i] = s.n;
}
outputs.set("public/data/locales/wow-forever/source.json", source);
const catalog = await read("public/data/classes/catalog.json");
const catalogDescriptions = [...new Set(catalog.classes.flatMap((c) => [...c.trees.flatMap((t) => t.new), ...c.abilities.new].map((a) => a.description).filter(Boolean)))];
const guides = await read(`${directory}/guide-delta.json`);
const writeupSource = await read("public/data/spells/writeups/locales/source.json");
const currentWriteups = new Set();
for (const c of calc.classes) {
  const data = await read(`public/data/spells/writeups/${c.n.toLowerCase()}.json`);
  for (const a of [...Object.values(data.abilities ?? {}), ...Object.values(data.talents ?? {})]) for (const field of ["summary", "forever", "details", "useWhen", "avoidWhen"]) {
    for (const text of Array.isArray(a[field]) ? a[field] : [a[field]]) if (text) currentWriteups.add(text);
  }
}
const writeupStrings = [...new Set([...writeupSource.strings.filter((s) => currentWriteups.has(s)), ...[...currentWriteups].filter((s) => byText.has(s))])];
outputs.set("public/data/spells/writeups/locales/source.json", { version: 1, strings: writeupStrings });
const hash = (text) => createHash("sha256").update(text).digest("hex");
const summary = {};
const naturalPath = (data, parts) => {
  let node = data;
  return parts.map((part) => {
    const key = Array.isArray(node) ? Number(part) : String(part);
    node = node?.[key]; return key;
  });
};
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currentProse = (value, parts = [], found = []) => {
  if (typeof value === "string") {
    const key = parts.at(-1), parent = parts.at(-2);
    if (value.trim() && (["overview", "summary", "note", "forever", "why", "playstyle", "title", "notes", "battlegrounds", "world"].includes(key)
      || ["tips", "stats", "order", "why"].includes(parent) || key === "role" && parts[0] === "play")) found.push({ path: parts, source: value });
  } else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) currentProse(child, [...parts, key], found);
  return found;
};
for (const [language, locale] of Object.entries(inventory.languages)) {
  const existingProse = new Map();
  for (const id of Object.keys(guides)) {
    const pack = await read(`public/data/classes/guides/locales/${language}/${id}.json`);
    for (const edit of pack.edits) existingProse.set(edit.source, edit.text);
  }
  const pack = await read(`public/data/locales/wow-forever/${locale}.json`);
  while (pack.values.length < source.keys.length) pack.values.push(null);
  for (const [i, text] of nameUpdates) pack.values[i] = translation(text, language);
  outputs.set(`public/data/locales/wow-forever/${locale}.json`, pack);
  const linkedText = (text, original, classId) => {
    const choices = new Map();
    const ordered = [...classMetadata].sort((a, b) => Number(b.n.toLowerCase() === classId) - Number(a.n.toLowerCase() === classId));
    for (const cls of ordered) for (const entry of [...cls.abilities, ...cls.trees.flatMap((t) => t.talents)]) {
      const id = typeof entry.ranks[0] === "number" ? entry.ranks[0] : entry.ranks[0]?.id;
      const index = sourceIndexes.get(`SpellName:${id}:0`), label = pack.values[index];
      if (!id || !original.includes(entry.n) || source.values[index] !== entry.n || !label || /[\]\r\n]/.test(label)) continue;
      if (!choices.has(label)) choices.set(label, id);
    }
    if (!choices.size) return text;
    const pattern = new RegExp(`(?<![A-Za-z])(?:${[...choices.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join("|")})(?![A-Za-z])`, "g");
    const linked = text.split(/(\[\[spell:\d+\|[^\]]+\]\])/g).map((part) => part.startsWith("[[spell:") ? part : part.replace(pattern, (label) => `[[spell:${choices.get(label)}|${label}]]`)).join("");
    return language === "ko" ? resolveKoreanGuideParticles(linked, (token) => token) : linked;
  };
  const talentPack = { version: 1, sourceBuild: calc.sourceBuild, clientBuild: 70790, language, entries: {} };
  for (const c of calc.classes) for (const tr of c.trees) for (const t of tr.talents) {
    talentPack.entries[t.id] = { name: { source: t.n, text: translation(t.n, language) }, ranks: Object.fromEntries(t.d.map((text, i) => [i, { source: text, text: translation(text, language) }])) };
  }
  localizeTalentCatalog(calc.classes, calc.sourceBuild, language, talentPack);
  outputs.set(`public/data/classes/locales/talents-${language}.json`, talentPack);
  outputs.set(`public/data/classes/locales/${language}.json`, { version: 1, translations: Object.fromEntries(catalogDescriptions.map((s) => [s, translation(s, language)])) });
  const tooltipPack = await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`);
  let tooltipFields = 0;
  for (const s of changed) for (const key of ["d", "a", "r"]) {
    if (!s[key]) { if (tooltipPack.entries[s.id]) delete tooltipPack.entries[s.id][key]; continue; }
    if (!s[key] || !byText.has(s[key])) continue;
    const entry = tooltipPack.entries[s.id] ??= {};
    entry[key] = translation(s[key], language); tooltipFields++;
  }
  tooltipPack.launchUpdateBuild = 70790;
  outputs.set(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`, tooltipPack);
  for (const [id, { data, changed: changedFields }] of Object.entries(guides)) {
    const p = `public/data/classes/guides/locales/${language}/${id}.json`;
    const existing = await read(p), edits = new Map();
    for (const edit of existing.edits) {
      const current = edit.path.reduce((value, key) => value?.[key], data);
      if (typeof current !== "string" || !current.trim()) continue;
      const text = edit.source === current ? edit.text : translation(current, language);
      const canonicalPath = naturalPath(data, edit.path);
      edits.set(JSON.stringify(canonicalPath.map(String)), { path: canonicalPath, source: current, text: linkedText(text, current, id) });
    }
    for (const edit of changedFields) if (edit.source.trim()) edits.set(JSON.stringify(edit.path.map(String)), {
      ...edit, path: naturalPath(data, edit.path), text: linkedText(translation(edit.source, language), edit.source, id),
    });
    for (const edit of currentProse({ guide: data.guide, play: data.play, builds: data.builds })) {
      const key = JSON.stringify(edit.path.map(String));
      if (edits.has(key)) continue;
      const text = byText.has(edit.source) ? translation(edit.source, language) : existingProse.get(edit.source);
      if (!text?.trim()) throw new Error(`Missing current guide prose: ${language}/${id}/${edit.path.join(".")}`);
      edits.set(key, { ...edit, path: naturalPath(data, edit.path), text: linkedText(text, edit.source, id) });
    }
    const value = { version: 1, classId: id, edits: [...edits.values()] };
    applyClassGuideText(data, value.edits); outputs.set(p, value);
  }
  const oldWriteup = await read(`public/data/spells/writeups/locales/${language}.json`);
  const oldValues = new Map(writeupSource.strings.map((s, i) => [s, oldWriteup.values[i]]));
  outputs.set(`public/data/spells/writeups/locales/${language}.json`, { version: 1, language,
    values: writeupStrings.map((s) => byText.has(s) ? translation(s, language) : oldValues.get(s)) });
  const ui = await read(`src/i18n/locales/${language}.json`);
  const englishUi = await read("src/i18n/locales/en.json");
  ui.spells.retired = translation(englishUi.spells.retired, language);
  outputs.set(`src/i18n/locales/${language}.json`, ui);
  summary[language] = { talentCount: Object.keys(talentPack.entries).length, tooltipFields,
    origins: Object.fromEntries([...new Set(inventory.entries.map((e) => e.origins[language]))].map((o) => [o, inventory.entries.filter((e) => e.origins[language] === o).length])) };
}
// Validate every output before modifying any app file, then retain first backups.
const scope = [];
for (const [file, value] of outputs) {
  const bytes = `${JSON.stringify(value)}\n`;
  const previous = await readFile(file, "utf8");
  const remotePath = file.startsWith("public/") ? file.slice(7) : `data/locales/app/${path.basename(file)}`;
  if (bytes === previous) {
    scope.push({ path: remotePath, localPath: file, sha256: hash(bytes) });
    continue;
  }
  const backup = `${directory}/before/${file}`;
  await mkdir(path.dirname(backup), { recursive: true });
  try { await copyFile(file, backup, 1); } catch (error) { if (error.code !== "EEXIST") throw error; }
  await writeFile(file, bytes);
  scope.push({ path: remotePath, localPath: file, sha256: hash(bytes) });
}
await writeFile(`${directory}/locale-scope.json`, `${JSON.stringify({ version: 1, files: scope }, null, 2)}\n`);
await writeFile(`${directory}/application-report.json`, `${JSON.stringify({ nameUpdates: nameUpdates.length, files: scope.length, writeupStrings: writeupStrings.length, languages: summary }, null, 2)}\n`);
console.log(JSON.stringify({ files: scope.length, nameUpdates: nameUpdates.length, languages: Object.keys(summary).length }));
