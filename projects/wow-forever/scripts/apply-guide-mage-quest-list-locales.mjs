/** Localize unchanged Mage quest-route cells from ID-matched game quest titles. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalogs = await Promise.all([
  read("data/quest-title-localization/pfquest-classic-titles.json"),
  read("data/quest-title-localization/polestar-forever-titles.json"),
  read("data/quest-title-localization/polestar-forever-partial-titles.json"),
  read("data/npc-name-localization/pfquest-classic-names.json"),
  read("data/npc-name-localization/polestar-forever-names.json"),
  read("data/npc-name-localization/map-seeded-forever-names.json"),
]);
const source = await read("public/data/guides/leveling-mage.json");
const routes = [
  { parts: ["Speak with Jennea", "Mirror Lake"], then: true, faction: "Alliance" },
  { parts: ["Speak with Bink", "Mage-tastic Gizmonitor"], then: true, faction: "Alliance" },
  { parts: ["Speak with Anastasia", "The Balnir Farmstead"], then: true, faction: "Horde" },
  { parts: ["Speak with Un'thuwa", "Ju-Ju Heaps"], then: true, faction: "Horde" },
  { parts: ["Report to Jennea", "Investigate the Blue Recluse", "Gathering Materials",
    "Manaweave Robe"], faction: "Alliance" },
  { parts: ["Report to Anastasia", "Investigate the Alchemist Shop", "Gathering Materials",
    "Spellfire Robes"], faction: "Horde" },
  { parts: ["High Sorcerer Andromath", "Ur's Treatise on Shadow Magic", "Pristine Spider Silk",
    "Astral Knot Garment"], level: 28, faction: "Alliance" },
  { parts: ["Speak with Deino", "Waters of Xavian", "Laughing Sisters",
    "Nether-lace Garment"], faction: "Horde" },
];
const englishText = (route) => `${route.parts.map((part, index) =>
  `${index === 1 && route.then ? "then " : ""}${part}${index === 1 && route.level ? ` (${route.level})` : ""}`)
  .join(", ")} (${route.faction})`;
for (const route of routes) {
  if (!source.html.includes(`>${englishText(route)}<`)) {
    throw new Error(`Mage source route changed: ${englishText(route)}`);
  }
}
const names = new Map();
for (const catalog of catalogs) for (const [english, record] of Object.entries(catalog.titles ?? catalog.names)) {
  const byLocale = names.get(english) ?? new Map();
  for (const language of ["de", "fr"]) {
    if (!record[language]) continue;
    const values = byLocale.get(language) ?? new Set();
    values.add(record[language]);
    byLocale.set(language, values);
  }
  names.set(english, byLocale);
}
const check = process.argv.includes("--check");
for (const [language, thenWord] of [["de", "dann"], ["fr", "puis"]]) {
  const path = join(root, `public/data/guides/locales/${language}/leveling-mage.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  const factionNames = (await read(`src/i18n/locales/${language}.json`)).races.factions;
  let added = 0;
  for (const route of routes) {
    const translated = route.parts.map((name) => {
      const values = names.get(name)?.get(language);
      return values?.size === 1 ? [...values][0] : undefined;
    });
    if (translated.some((value) => !value)) continue;
    if (route.then) translated[1] = `${thenWord} ${translated[1]}`;
    if (route.level) translated[1] += ` (${route.level})`;
    const original = `>${englishText(route)}<`;
    const localized = `>${translated.join(", ")} (${factionNames[route.faction.toLowerCase()]})<`;
    if (target.html.split(original).length > 2) throw new Error(`${language}: duplicate Mage route`);
    if (target.html.includes(original)) { target.html = target.html.replace(original, localized); added += 1; }
  }
  const output = JSON.stringify(target) + (raw.endsWith("\n") ? "\n" : "");
  if (check) {
    if (output !== raw) throw new Error(`${language}: Mage quest routes are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} Mage quest routes localized`);
}
