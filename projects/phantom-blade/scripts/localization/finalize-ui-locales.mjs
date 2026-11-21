import fs from "node:fs";
import { flatten, validTranslation, setPath } from "./ui-locale-utils.mjs";
import { gameMapLabels } from "./game-map-labels.mjs";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const english = read("src/i18n/locales/en.json"), source = flatten(english);
const manifest = read("public/data/locales/phantom-blade-zero/manifest.json");
const overrides = read("data/localization/ui-context-overrides.json");
const evidence = {};
const uiAliases = {
  "wiki.unnamedEntries.npcs": "wiki.spawnGroups.npcs",
  "wiki.unnamedEntries.world-bosses": "wiki.spawnGroups.bosses",
  "wiki.groups.native-spawn-npc": "reference.categories.npcs",
  "wiki.groups.native-tag-boss": "reference.categories.world-bosses",
  "wiki.groups.native-spawn-creature": "reference.categories.creatures",
};
const nativeGroupKeys = {
  "wiki.groups.native-quest": "UI_Quest_06",
  "wiki.groups.weapons": "UI_Character_01",
  "wiki.groups.phantom-edges": "UI_Setting_315",
  "wiki.groups.accessories": "UI_Character_03",
  "wiki.groups.medicines": "UI_Character_04",
  "wiki.groups.appearances": "UI_Appearance_1",
};
const groupLabel = (value, language) => value === value.toLocaleUpperCase(language)
  ? value.toLocaleLowerCase(language).replace(/\p{L}/u, letter => letter.toLocaleUpperCase(language)) : value;
const nativeUiKeys = {
  "wiki.quest.marker": "UI_Quest_09",
  "settings.language": "UI_Setting_02",
  "wiki.creatureLoot.dust": "UI_SkillWidget_13",
  "wiki.weapon.shaChi": "UI_Character_32",
  "wiki.markerNames.ShaChiWeaponItemDatas": "UI_Setting_315",
  "wiki.nativeValues.ShaChiWeaponUpgradeMaterial": "UI_Inventory_16",
  "wiki.nativeValues.ShaChiWeaponSnapSoulMaterial": "UI_Inventory_20",
  "wiki.nativeValues.MedicineUpgradeMaterial": "UI_Inventory_18",
  "wiki.fields.MaxShachi": "UI_AbilityWidget_05",
  "wiki.groups.Animal": "UI_Literature_31", "wiki.nativeValues.Animal": "UI_Literature_31",
  "wiki.groups.GuaiMian": "UI_Literature_32", "wiki.nativeValues.GuaiMian": "UI_Literature_32",
  "wiki.groups.DragonModified": "UI_Literature_33",
  "wiki.groups.HumanMaster": "UI_Literature_34",
  "wiki.groups.Puppet": "UI_Literature_35", "wiki.nativeValues.Puppet": "UI_Literature_35",
};
for (const { language, code } of manifest.locales) {
  if (language === "en") continue;
  const file = `src/i18n/locales/${language}.json`, locale = read(file);
  for (const [key, values] of Object.entries(overrides)) if (source[key] !== undefined && values[language]) setPath(locale, key, values[language]);
  const existing = flatten(locale);
  for (const [key, original] of Object.entries(uiAliases)) if (source[key] === source[original] && existing[original]) setPath(locale, key, existing[original]);
  const native = new Map(read(`public/data/game-files/build-26266538/localization/${code}.json`).entries.map(row => [row.key, row.text]));
  for (const [key, nativeKey] of Object.entries(nativeGroupKeys)) if (source[key] !== undefined && native.get(nativeKey)) setPath(locale, key, groupLabel(native.get(nativeKey), language));
  const shaChi = native.get("UI_Character_32");
  if (shaChi) for (const [key, value] of Object.entries(flatten(locale))) if (value.includes("Sha-Chi")) setPath(locale, key, value.replaceAll("Sha-Chi", shaChi));
  for (const [key, englishValue] of Object.entries(source)) if (englishValue === "Phantom Edges" && native.get("UI_Setting_315")) setPath(locale, key, native.get("UI_Setting_315"));
  for (const [key, nativeKey] of Object.entries(nativeUiKeys)) if (source[key] !== undefined && native.get(nativeKey)) setPath(locale, key, native.get(nativeKey));
  if (!native.get("UI_Quest_09") && native.get("UI_Quest_06")) setPath(locale, "wiki.quest.marker", groupLabel(native.get("UI_Quest_06"), language));
  const dust = native.get("UI_SkillWidget_13");
  if (dust) {
    const cost = { de: `${dust}-Kosten`, fr: `Coût en ${dust.toLowerCase()}`, es: `Coste en ${dust.toLowerCase()}`, "es-419": `Costo en ${dust.toLowerCase()}`,
      it: `Costo in ${dust.toLowerCase()}`, "pt-BR": `Custo em ${dust.toLowerCase()}`, pt: `Custo em ${dust.toLowerCase()}`, ru: `Затраты (${dust})`, ja: `${dust}の消費量`,
      ko: `${dust} 소모량`, th: `ค่าใช้จ่าย (${dust})`, vi: `Chi phí ${dust.toLowerCase()}`, "zh-Hans": `${dust}消耗`, "zh-Hant": `${dust}消耗` }[language];
    if (cost) for (const key of ["wiki.fields.NeedDust", "wiki.fields.ConsumeDust"]) setPath(locale, key, cost);
  }
  const maps = gameMapLabels(language, code, english.map.maps.names);
  Object.assign(locale.map.maps.names, maps.labels);
  evidence[language] = maps.evidence;
  const values = flatten(locale);
  for (const [key, value] of Object.entries(source)) if (!validTranslation(value, values[key])) throw new Error(`Missing/invalid ${language}:${key}`);
  fs.writeFileSync(file, JSON.stringify(locale, null, 2) + "\n");
}
fs.mkdirSync("artifacts/localization-2026-10-29", { recursive: true });
fs.writeFileSync("artifacts/localization-2026-10-29/map-name-evidence.json", JSON.stringify(evidence, null, 2));
console.log("Verified every UI key and restored region names from their exact game localization keys.");
