import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { applyClassGuideText } from "../src/features/classes/class-guide-localization.ts";
import { classSpellIds, resolveClassGuideSpells, resolveGuideClassNames, resolveGuideMapNames, resolveGuideRaceNames, resolveGuideItemNames, resolveKoreanGuideParticles } from "./lib/class-guide-spell-terms.mjs";
import { specializationKey } from "../src/i18n/specialization-keys.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const directory = join(root, "public/data/classes/guides");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const source = await json(join(directory, "class-guides.json"));
const stats = await json(join(directory, "stats.json"));
const classes = await json(join(root, "public/data/spells/foreverdb/classes.json"));
const allClassSpells = new Map(classes.map((entry) => [entry.n.toLowerCase(), classSpellIds(entry)]));
const localeRoot = join(root, "public/data/locales/wow-forever");
const gameSource = await json(join(localeRoot, "source.json"));
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const packs = Object.fromEntries(await Promise.all(languages.map(async (language) =>
  [language, await json(join(localeRoot, codes[language] + ".json"))])));
const catalogPath = join(root, "data/class-guide-localization");
const statTerms = await json(join(root, "data/class-guide-stat-terms.json"));
if (JSON.stringify(statTerms.languages) !== JSON.stringify(languages) ||
  Object.values(statTerms.terms).some((labels) => labels.length !== languages.length || labels.some((label) => typeof label !== "string" || !label.trim()))) {
  throw new Error("Incomplete stat terminology");
}
const classFilter = process.argv.find((arg) => arg.startsWith("--class="))?.slice("--class=".length);
const files = (await readdir(catalogPath)).filter((name) => name.endsWith(".json") &&
  (!classFilter || name === `${classFilter}.json`)).sort();
if (classFilter && files.length !== 1) throw new Error("Unknown class catalog: " + classFilter);
const outputs = [];
const manifest = { version: 1, languages: Object.fromEntries(languages.map((language) => [language, []])) };
for (const file of files) {
  const classId = file.slice(0, -5);
  const name = Object.keys(source.classes).find((name) => name.toLowerCase() === classId);
  if (!name) throw new Error("Unknown class: " + classId);
  const metadata = classes.find((entry) => entry.n === name);
  if (!metadata) throw new Error("Missing class spell metadata: " + classId);
  const spellIds = classSpellIds(metadata);
  const data = {
    guide: source.classes[name],
    play: await json(join(directory, classId + "-play.json")),
    builds: await json(join(directory, classId + "-builds.json")),
    stats,
  };
  const catalog = await json(join(catalogPath, file));
  const addStatTerms = (node, path = []) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const next = [...path, key];
      const isStatList = Array.isArray(node) && (path.at(-1) === "stats" ||
        path.at(-1) === "order" && path.at(-2) === "stats");
      if ((isStatList || path[0] === "stats") && typeof value === "string" && Object.hasOwn(statTerms.terms, value)) {
        if (!catalog.edits.some((edit) => JSON.stringify(edit.path) === JSON.stringify(next))) {
          catalog.edits.push({ path: next, source: value, translations: Object.fromEntries(
            languages.map((language, index) => [language, statTerms.terms[value][index]])) });
        }
      } else if (value && typeof value === "object") addStatTerms(value, next);
    }
  };
  addStatTerms(data);
  for (const note of catalog.notes ?? []) {
    let matches = 0;
    const visit = (node, path = []) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        const next = [...path, key];
        const isTip = Array.isArray(node) && path.at(-1) === "tips";
        if ((key === "note" || isTip) && value === note.source) {
          if (!catalog.edits.some((edit) => JSON.stringify(edit.path) === JSON.stringify(next))) {
            catalog.edits.push({ path: next, source: note.source, translations: note.translations });
          }
          matches += 1;
        } else if (value && typeof value === "object") visit(value, next);
      }
    };
    visit(data);
    if (!matches) throw new Error("Unmatched class guide note: " + note.source);
  }
  for (const entry of catalog.edits) {
    if (Object.keys(entry.translations).sort().join() !== [...languages].sort().join()) {
      throw new Error("Incomplete language set: " + file);
    }
  }
  for (const language of languages) {
    const edits = catalog.edits.map(({ path, source, translations }) => {
      const resolveTerms = (input) => {
        const prose = input.replace(/\{\{SPEC:([^}]+)\}\}/g, (_, name) => {
          const key = specializationKey(classId, name);
          const index = gameSource.keys.indexOf(key);
          const label = packs[language].values[index];
          if (!source.includes(name) || index < 0 || typeof label !== "string" || !label) {
            throw new Error("Unverified specialization: " + name);
          }
          return label;
        });
        const itemProse = resolveGuideItemNames(prose, source, gameSource, packs[language]);
        const racialProse = resolveGuideRaceNames(itemProse, source, gameSource, packs[language]);
        const namedProse = resolveGuideMapNames(resolveGuideClassNames(racialProse, source, gameSource, packs[language]), source, gameSource, packs[language]);
        return resolveClassGuideSpells(namedProse, source, spellIds, gameSource, packs[language], allClassSpells);
      };
      const adjusted = language === "ko" ? resolveKoreanGuideParticles(translations[language], resolveTerms) : translations[language];
      const text = resolveTerms(adjusted);
      if (/\{\{/.test(text)) throw new Error("Unresolved guide term: " + text);
      return { path, source, text };
    });
    applyClassGuideText(data, edits);
    outputs.push([join(directory, "locales", language, file), { version: 1, classId, edits }]);
    manifest.languages[language].push(classId);
    console.log(language + "/" + classId + ": " + edits.length + " translated prose fields");
  }
}
if (!classFilter) outputs.push([join(directory, "locales/index.json"), manifest]);
for (const [path, value] of outputs) {
  const result = JSON.stringify(value, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (await readFile(path, "utf8") !== result) throw new Error("Stale output: " + path);
  } else {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, result);
  }
}
