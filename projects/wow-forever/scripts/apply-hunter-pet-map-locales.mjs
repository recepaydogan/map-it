/** Keep hunter pet map labels aligned with the reviewed guide family names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const guide = await read("data/guide-localization/hunter-pet-table.json");
const groupLabels = {
  de: "Jägerbegleiter",
  es: "Mascotas de cazador",
  "es-MX": "Mascotas de cazador",
  fr: "Familiers de chasseur",
  ko: "사냥꾼 야수",
  "pt-BR": "Mascotes de Caçador",
  "zh-Hans": "猎人宠物",
  "zh-Hant": "獵人寵物",
};
const detailLabels = {
  de: ["Zähmbar", "Fähigkeiten der Tierfamilie"],
  es: ["Domesticable", "Habilidades de la familia"],
  "es-MX": ["Domesticable", "Habilidades de la familia"],
  fr: ["Apprivoisable", "Techniques de la famille"],
  ko: ["길들일 수 있음", "야수 계열 기술"],
  "pt-BR": ["Domável", "Habilidades da família"],
  "zh-Hans": ["可驯服", "宠物家族技能"],
  "zh-Hant": ["可馴服", "寵物家族技能"],
};
const familyEntries = Object.entries(english.map.hunterPets);
if (familyEntries.length !== 18 || english.map.categoryGroups.hunterPets !== "Hunter Pets" ||
  english.map.hunterPetDetails.tameable !== "Tameable" ||
  english.map.hunterPetDetails.level !== "Level {{level}}" ||
  english.map.hunterPetDetails.abilities !== "Family abilities" ||
  english.map.rares.level !== english.map.hunterPetDetails.level) {
  throw new Error("Hunter pet English map labels changed");
}

const pendingWrites = [];
for (const [language, groupLabel] of Object.entries(groupLabels)) {
  // The reviewed guide has no Mexican Spanish variant; reuse its Spanish game terms.
  const families = guide[language === "es-MX" ? "es" : language]?.families;
  if (!families || Object.keys(families).length !== familyEntries.length ||
    familyEntries.some(([, englishName]) => !families[englishName]?.trim())) {
    throw new Error(`${language}: incomplete reviewed hunter pet families`);
  }
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  locale.map.hunterPets ??= {};
  for (const [key, englishName] of familyEntries) {
    const translated = families[englishName];
    if (locale.map.hunterPets[key] && locale.map.hunterPets[key] !== translated) {
      throw new Error(`${language}/${key}: map label conflicts with reviewed guide`);
    }
    locale.map.hunterPets[key] = translated;
  }
  if (locale.map.categoryGroups.hunterPets &&
    locale.map.categoryGroups.hunterPets !== groupLabel) {
    throw new Error(`${language}: hunter pet group label conflicts`);
  }
  locale.map.categoryGroups.hunterPets = groupLabel;
  locale.map.hunterPetDetails ??= {};
  const [tameable, abilities] = detailLabels[language];
  const details = { tameable, level: locale.map.rares.level, abilities };
  if (typeof details.level !== "string" || !details.level.includes("{{level}}")) {
    throw new Error(`${language}: unavailable reviewed level label`);
  }
  for (const [key, translated] of Object.entries(details)) {
    if (locale.map.hunterPetDetails[key] && locale.map.hunterPetDetails[key] !== translated) {
      throw new Error(`${language}/${key}: pet detail label conflicts`);
    }
    locale.map.hunterPetDetails[key] = translated;
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: hunter pet map labels are stale`);
  } else if (output !== raw) pendingWrites.push([path, output]);
  console.log(`${language}: ${familyEntries.length} pet families, one group label, three detail labels verified`);
}
for (const [path, output] of pendingWrites) await writeFile(path, output);
