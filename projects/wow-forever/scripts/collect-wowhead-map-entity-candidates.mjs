/** Group captured Wowhead map names by source identity and locale. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHtml, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "data/site-research/wowhead-map-entity-name-candidates.json");
const source = JSON.parse(await readFile(join(root,
  "public/data/locales/wow-forever/map-entity-source.json"), "utf8"));
const sourceById = new Map(source.keys.map((key, index) => [key, source.values[index]]));
const questText = JSON.parse(await readFile(join(root,
  "public/data/locales/wow-forever/quest-text-source.json"), "utf8"));
const objectiveById = new Map(questText.keys.flatMap((key, index) => {
  const match = /^(\d+):objective$/.exec(key);
  return match ? [[Number(match[1]), questText.values[index]]] : [];
}));
const objective = (record) => {
  const html = record?.tooltip.match(/<\/table><table><tr><td>([\s\S]*?)<\/td><\/tr><\/table>/)?.[1];
  const objectiveHtml = html?.replace(/<br\s*\/?\s*>\s*<br\s*\/?\s*>\s*<span class="q">[^<]+<\/span>[\s\S]*$/i, "");
  return objectiveHtml ? decodeHtml(objectiveHtml.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ").trim() : null;
};
const captures = new Map();
for (const line of (await readFile(join(root,
  "data/site-research/wowhead-map-entity-locale-captures.jsonl"), "utf8"))
  .split(/\r?\n/)) {
  if (!line) continue;
  const record = JSON.parse(line);
  captures.set(`${record.kind}:${record.id}:${record.locale}`, record);
}
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const candidates = [];
const counts = { ids: 0, translated: 0, unchanged: 0,
  missing: 0, englishSourceMismatch: 0, byLocale: {},
  objectives: { translated: 0, unchanged: 0, sourceMatches: 0 } };
for (const key of source.keys) {
  const match = /^(Creature|Quest):(\d+):0$/.exec(key);
  if (!match) continue;
  const kind = match[1] === "Creature" ? "npc" : "quest";
  const id = Number(match[2]);
  const english = captures.get(`${kind}:${id}:en`);
  const localized = Object.entries(locales).flatMap(([short, locale]) => {
    const record = captures.get(`${kind}:${id}:${short}`);
    return record ? [[locale, record]] : [];
  });
  if (!english && !localized.length) continue;
  counts.ids++;
  const sourceName = sourceById.get(key);
  const sourceMatches = english?.name === sourceName;
  if (english && !sourceMatches) counts.englishSourceMismatch++;
  const names = {};
  const evidence = {};
  const objectives = {};
  const englishObjective = kind === "quest" ? objective(english) : null;
  const objectiveSource = kind === "quest" ? objectiveById.get(id) : null;
  const objectiveSourceMatches = Boolean(englishObjective && objectiveSource &&
    sameWords(englishObjective, objectiveSource));
  if (objectiveSourceMatches) counts.objectives.sourceMatches++;
  for (const [locale, record] of localized) {
    const status = !english ? "missing-english" :
      record.name === english.name ? "unchanged" : "translated";
    names[locale] = { value: record.name, status };
    evidence[locale] = record.url;
    counts[status === "missing-english" ? "missing" : status]++;
    const tally = counts.byLocale[locale] ??
      { translated: 0, unchanged: 0, missing: 0 };
    tally[status === "missing-english" ? "missing" : status]++;
    counts.byLocale[locale] = tally;
    if (kind === "quest") {
      const value = objective(record);
      if (value) {
        const objectiveStatus = !englishObjective ? "missing-english" :
          sameWords(value, englishObjective) ? "unchanged" : "translated";
        objectives[locale] = { value, status: objectiveStatus };
        if (objectiveStatus !== "missing-english") counts.objectives[objectiveStatus]++;
      }
    }
  }
  candidates.push({ kind, id, source: sourceName,
    wowheadEnglish: english?.name ?? null, sourceMatches: Boolean(sourceMatches),
    names, evidence,
    ...(kind === "quest" ? { objectiveSource, wowheadEnglishObjective: englishObjective,
      objectiveSourceMatches, objectives } : {}) });
}
await writeFile(output, `${JSON.stringify({ version: 1, counts, candidates }, null, 2)}\n`);
console.log(JSON.stringify(counts));
