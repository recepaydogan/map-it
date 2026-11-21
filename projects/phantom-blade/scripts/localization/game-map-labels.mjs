import fs from "node:fs";
import { canonicalText } from "./ui-locale-utils.mjs";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const root = "public/data/game-files/build-26266538";
const catalog = read(`${root}/catalog.json`);
const rows = read(`${root}/${catalog.tables.find(table => table.name === "DT_MapData").file}`).rows;
const maps = read("public/data/maps/catalog.json").maps;
const english = read(`${root}/localization/en-US.json`).entries;
const englishByKey = new Map(english.map(row => [`${row.namespace}:${row.key}`, row.text]));
const winter = { "zh-Hans": "冬季", "zh-Hant": "冬季", de: "Winter", fr: "Hiver", es: "Invierno", "es-419": "Invierno", it: "Inverno", "pt-BR": "Inverno", pt: "Inverno", ru: "Зима", ja: "冬", ko: "겨울", th: "ฤดูหนาว", vi: "Mùa đông" };

/** Region names are official locres values; only the app's winter suffix is app-authored. */
export function gameMapLabels(language, code, sourceNames) {
  const translated = new Map(read(`${root}/localization/${code}.json`).entries.map(row => [`${row.namespace}:${row.key}`, row.text]));
  const labels = {}, evidence = {};
  for (const map of maps) {
    if (map.id.startsWith("world-")) continue;
    const refs = map.source.records.map(row => rows[row.row]?.MapName).filter(Boolean);
    const keys = refs.map(ref => `${ref.Namespace}:${ref.Key}`);
    const sources = [];
    labels[map.id] = sourceNames[map.id].split(/(\s+[·/]\s+)/).map(part => {
      if (/^\s+[·/]\s+$/.test(part)) return part;
      if (part === "Winter") return winter[language] ?? part;
      const key = keys.find(key => canonicalText(englishByKey.get(key) ?? "") === canonicalText(part));
      if (!key) throw new Error(`No native region-name key for ${map.id}: ${part}`);
      if (!translated.get(key)) throw new Error(`Missing official map translation ${code}:${key}`);
      sources.push(key);
      return translated.get(key);
    }).join("");
    evidence[map.id] = sources;
  }
  return { labels, evidence };
}
