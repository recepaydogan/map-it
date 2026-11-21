/** Pack installed-client translations without translating or inventing game content. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const data = "public/data/game-files/build-26266538";
const output = "public/data/locales/phantom-blade-zero";
export const localeCodes = { en: "en-US", "zh-Hans": "zh-Hans", "zh-Hant": "zh-Hant", de: "de", fr: "fr", es: "es-ES", "es-419": "es-419", it: "it", "pt-BR": "pt-BR", pt: "pt-PT", ru: "ru", ja: "ja", ko: "ko", th: "th", vi: "vi" };
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value) + "\n"); };
const english = read(`${data}/localization/en-US.json`);
const sourceByKey = new Map(english.entries.map(row => [`${row.namespace}:${row.key}`, row.text]));
const entries = fs.readdirSync("public/data/wiki/entries").map(file => read(`public/data/wiki/entries/${file}`));
const entriesById = new Map(entries.map(entry => [entry.id, entry]));
const quests = new Map(read(`${data}/database/quests.json`).records.map(quest => [quest.id, quest]));
const aliases = {};
const composites = {};
const tableCatalog = read(`${data}/catalog.json`).tables;
const table = name => read(`${data}/${tableCatalog.find(row => row.name === name).file}`).rows;
const bellRows = table("DT_BellData"), mapRows = table("DT_MapData");
const normalize = value => value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
const add = (id, pointer, ref, value) => {
  const namespace = ref?.Namespace ?? ref?.namespace, key = ref?.Key ?? ref?.key;
  if (typeof namespace !== "string" || typeof key !== "string" || !key || typeof value !== "string") return;
  const nativeKey = `${namespace}:${key}`, original = sourceByKey.get(nativeKey);
  if (original && normalize(original) === normalize(value)) aliases[`Wiki:${id}:${pointer}`] = nativeKey;
};
const walk = (id, pointer, original, displayed) => {
  if (typeof displayed === "string") { add(id, pointer, original, displayed); return; }
  if (Array.isArray(displayed) && Array.isArray(original)) displayed.forEach((value, i) => walk(id, `${pointer}/${i}`, original[i], value));
  else if (displayed && original && typeof displayed === "object" && typeof original === "object") {
    for (const [key, value] of Object.entries(displayed)) walk(id, `${pointer}/${key}`, original[key], value);
  }
};
for (const entry of entries) {
  add(entry.id, "/name", entry.native?.name, entry.name);
  if (entry.npcNameEvidence) add(entry.id, "/name", { Namespace: "Default", Key: entry.npcNameEvidence.speakerKey }, entry.name);
  if (entry.nameEvidence) add(entry.id, "/name", { Namespace: entry.nameEvidence.namespace, Key: entry.nameEvidence.key }, entry.name);
  const quest = quests.get(entry.id);
  if (quest && entry.quest) {
    // Quest flow references omit Namespace; the native resolver uses Default.
    const questRef = ref => ref?.Key ? { Namespace: "Default", ...ref } : ref;
    add(entry.id, "/name", questRef(quest.nameReference), entry.name);
    entry.descriptions.forEach((description, i) => add(entry.id, `/descriptions/${i}/text`, questRef(quest.descriptionReference), description.text));
    entry.quest.stages.forEach((stage, i) => {
      add(entry.id, `/quest/stages/${i}/title`, questRef(stage.titleReference), stage.title);
      add(entry.id, `/quest/stages/${i}/description`, questRef(stage.descriptionReference), stage.description);
    });
  }
  const nativeMap = entry.native?.native;
  if (entry.group === "BellDatas") {
    const bell = Object.values(bellRows).find(row => row.BellID === nativeMap?.BellID);
    if (bell) {
      add(entry.id, "/name", bell.BellName, entry.name);
      entry.sections.forEach((section, i) => { if (section.label === "bell") walk(entry.id, `/sections/${i}/value`, bell, section.value); });
    }
  }
  if (entry.group === "Portal" && nativeMap?.TargetMapID) {
    const destination = Object.values(mapRows).find(row => String(row.MapID).toLowerCase() === String(nativeMap.TargetMapID).toLowerCase());
    const ref = destination?.MapName;
    if (ref) {
      const keys = ["Default:UI_Map_30", `${ref.Namespace}:${ref.Key}`];
      const englishName = keys.map(key => sourceByKey.get(key)).join(" ");
      if (normalize(englishName) === normalize(entry.name)) composites[`Wiki:${entry.id}:/name`] = { keys, english: entry.name, separator: " " };
    }
  }
  const fields = entry.native?.localized_fields ?? [];
  entry.descriptions.forEach((description, i) => {
    const reference = fields.find(field => field.field.split("/").at(-1) === description.label && field.text === description.text)
      ?? (entry.native?.description?.text === description.text ? entry.native.description : undefined);
    add(entry.id, `/descriptions/${i}/text`, reference, description.text);
  });
  entry.sections.forEach((section, i) => walk(entry.id, `/sections/${i}/value`, entry.native?.fields?.[section.label], section.value));
}
for (const entry of entries) {
  if (aliases[`Wiki:${entry.id}:/name`]) continue;
  const item = entry.links.map(link => entriesById.get(link.id)).find(target => target?.category === "items" && normalize(target.name) === normalize(entry.name));
  if (item && aliases[`Wiki:${item.id}:/name`]) aliases[`Wiki:${entry.id}:/name`] = aliases[`Wiki:${item.id}:/name`];
}
const keys = english.entries.map(row => `${row.namespace}:${row.key}`);
write(`${output}/source.json`, { version: 1, keys, values: english.entries.map(row => row.text), aliases, composites });
const report = { version: 1, build: "26266538", entries: keys.length, aliases: Object.keys(aliases).length, composites: Object.keys(composites).length, locales: [], excluded: [] };
for (const [language, code] of Object.entries(localeCodes)) {
  const file = `${data}/localization/${code}.json`, catalog = read(file);
  const valuesByKey = new Map(catalog.entries.map(row => [`${row.namespace}:${row.key}`, row.text]));
  const values = keys.map(key => valuesByKey.get(key) || null);
  write(`${output}/${code}.json`, { version: 1, values });
  report.locales.push({ language, code, source: catalog.source, sourceJsonSha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), populated: values.filter(Boolean).length, empty: values.filter(value => !value).length });
}
const hebrew = read(`${data}/localization/he.json`);
if (!hebrew.entries.some(row => /[\u0590-\u05ff]/.test(row.text))) report.excluded.push({ code: "he", reason: "The packaged resource contains no Hebrew-script text; it contains Chinese fallback text." });
write(`${output}/manifest.json`, report);
console.log(JSON.stringify({ languages: report.locales.length, entries: report.entries, aliases: report.aliases, excluded: report.excluded.map(row => row.code) }));
