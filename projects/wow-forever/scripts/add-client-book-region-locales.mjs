/** Fill book location labels and French regions from reviewed client AreaTable rows. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const french = await read("public/data/locales/wow-forever/frFR.json");
const areaKeys = {
  Westfall: "AreaTable:16149:1",
  "Elwynn Forest": "AreaTable:12:1",
  Duskwood: "AreaTable:16148:1",
  "Eastern Plaguelands": "AreaTable:16028:1",
};
const frenchRegions = {};
for (const [name, key] of Object.entries(areaKeys)) {
  const index = source.keys.indexOf(key);
  if (index < 0 || source.values[index] !== name || !french.values[index] || french.values[index] === name) {
    throw new Error(`Unverified French book region: ${name}`);
  }
  frenchRegions[name] = french.values[index];
}
const check = process.argv.includes("--check");
for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
  const file = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(file, "utf8");
  const target = JSON.parse(raw);
  if (english.map.books.reportedLocation !== english.map.questNpcs.reportedLocation ||
    target.map.questNpcs.reportedLocation !== target.map.rares.reportedLocation) {
    throw new Error(`${language}: book location label context differs`);
  }
  target.map.books.reportedLocation ??= target.map.questNpcs.reportedLocation;
  let count = 0;
  if (language === "fr") {
    target.map.books.regions ??= {};
    for (const [id, name] of Object.entries(english.map.books.regions)) {
      const translated = frenchRegions[name];
      if (!translated || target.map.books.regions[id]) continue;
      target.map.books.regions[id] = translated;
      count += 1;
    }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: book labels are stale`);
  } else if (output !== raw) await writeFile(file, output);
  console.log(`${language}: ${count} book regions added`);
}
