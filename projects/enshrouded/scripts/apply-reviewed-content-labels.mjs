import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = file => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const reviewed = read("scripts/reviewed-content-labels.json");
const wiki = read("public/data/enshrouded/wiki-catalog.json");
const englishUi = read("src/i18n/locales/en.json");
const directory = "public/data/enshrouded/content-locales";
const source = read(`${directory}/source.json`);
const languages = read("scripts/enshrouded-languages.json");
let corrections = 0;
for (const [english, entry] of Object.entries(reviewed)) {
  if (entry.context === "map-category") {
    if (entry.uiKey.split(".").reduce((value, key) => value?.[key], englishUi) !== english)
      throw new Error(`Reviewed map category context has changed: ${english}`);
  } else {
    const record = wiki.records.find(record => record.name === english);
    if (record?.type !== entry.context) throw new Error(`Reviewed label context has changed: ${english}`);
  }
  const index = source.values.indexOf(english);
  if (index < 0) throw new Error(`Reviewed label is absent from the display inventory: ${english}`);
  for (const code of Object.keys(languages).filter(code => code !== "en")) {
    const file = `${directory}/${code.toLowerCase()}.json`;
    if (!existsSync(resolve(root, file))) continue;
    const pack = read(file);
    if (pack.sourceSha256 !== source.sourceSha256 || pack.values.length !== source.values.length)
      throw new Error(`Reviewed labels require a current aligned ${code} pack`);
    if (!entry.translations[code]) throw new Error(`Missing reviewed ${code} label: ${english}`);
    if (pack.values[index] !== entry.translations[code]) {
      pack.values[index] = entry.translations[code];
      writeFileSync(resolve(root, file), JSON.stringify(pack) + "\n");
      corrections++;
    }
  }
}
console.log(`Applied ${corrections} reviewed content-label corrections`);
