/** Find client game terms used in app-authored guides for contextual translation. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const localeRoot = join(root, "public/data/locales/wow-forever");
const source = JSON.parse(await readFile(join(localeRoot, "source.json"), "utf8"));
const provenance = JSON.parse(await readFile(join(localeRoot, "provenance.json"), "utf8"));
const packs = Object.fromEntries(await Promise.all(provenance.locales.slice(1).map(async (locale) =>
  [locale, JSON.parse(await readFile(join(localeRoot, `${locale}.json`), "utf8"))])));

const nameFields = new Map([
  ["ItemSparse", new Set([4])], ["SpellName", new Set([0])],
  ["AreaTable", new Set([1])], ["ChrClasses", new Set([0, 2, 3, 8, 9])],
  ["ChrRaces", new Set([1, 2, 4, 6, 8, 11, 13])], ["SkillLine", new Set([0])],
  ["Map", new Set([1])],
  ...["Achievement", "Creature", "CurrencyTypes", "DungeonEncounter", "Faction",
    "ItemClass", "ItemSet", "ItemSubClass", "LFGDungeons", "Mount"]
    .map((name) => [name, new Set([0])]),
]);
const guideDirs = ["public/data/guides", "public/data/classes/guides"];
const guideFiles = (await Promise.all(guideDirs.map(async (directory) =>
  (await readdir(join(root, directory)))
    .filter((name) => name.endsWith(".json"))
    .map((name) => `${directory}/${name}`)))).flat();

function collectText(value, result) {
  if (typeof value === "string") {
    if (value.length >= 8) result.push(value.replace(/<[^>]*>/g, " "));
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, result));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectText(entry, result));
  }
}

const guideText = new Map();
for (const file of guideFiles) {
  const values = [];
  collectText(JSON.parse(await readFile(join(root, file), "utf8")), values);
  guideText.set(file, values.join(" ").toLocaleLowerCase("en-US"));
}
const corpus = [...guideText.values()].join(" ");
const candidates = new Map();
for (let index = 0; index < source.keys.length; index += 1) {
  const [table, , field] = source.keys[index].split(":");
  if (!nameFields.get(table)?.has(Number(field))) continue;
  const english = source.values[index];
  if (!english || english.length < 4 || english.length > 80 || /[\r\n<>]/.test(english)) continue;
  if (!candidates.has(english)) candidates.set(english, []);
  candidates.get(english).push(index);
}

const terms = [];
for (const [english, indices] of candidates) {
  if (!corpus.includes(english.toLocaleLowerCase("en-US"))) continue;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
  const guides = [...guideText].filter(([, text]) => pattern.test(text)).map(([file]) => file);
  if (!guides.length) continue;
  const localized = Object.fromEntries(Object.entries(packs).map(([locale, pack]) => {
    const options = [...new Set(indices.map((index) => pack.values[index]).filter(Boolean))];
    return [locale, options.length === 1 ? options[0] : null];
  }));
  terms.push({ english, sources: indices.map((index) => source.keys[index]), localized, guides });
}
terms.sort((a, b) => a.english.localeCompare(b.english, "en"));
const destination = join(root, "data/client-research/guide-game-glossary.json");
await mkdir(join(root, "data/client-research"), { recursive: true });
await writeFile(destination, JSON.stringify({ sourceBuild: provenance.build, terms }, null, 2) + "\n");
console.log(`Found ${terms.length} client game terms in ${guideFiles.length} guide files: ${destination}`);
