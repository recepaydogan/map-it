/** Localize published map hints while keeping server-side quest and NPC names intact. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const reviewedNpcDetails = await read("data/map-community-localization/reviewed-npc-details.json");
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const words = {
  de: { starts: "Beginnt bei", turnIn: "Abgeben bei", levels: "Empfohlene Stufen",
    droppedBy: "Erbeutet von", inside: "In", requires: "Benötigt" },
  es: { starts: "Empieza con", turnIn: "Entregar a", levels: "Niveles recomendados",
    droppedBy: "Lo suelta", inside: "Dentro de", requires: "Requiere" },
  "es-MX": { starts: "Empieza con", turnIn: "Entregar a", levels: "Niveles recomendados",
    droppedBy: "Lo suelta", inside: "Dentro de", requires: "Requiere" },
  fr: { starts: "Commence auprès de", turnIn: "À rendre à", levels: "Niveaux conseillés",
    droppedBy: "Lâché par", inside: "Dans", requires: "Nécessite" },
  ko: { starts: "시작 대상:", turnIn: "완료 대상:", levels: "권장 레벨",
    droppedBy: "드롭:", inside: "안에 있음:", requires: "필요:" },
  "pt-BR": { starts: "Começa com", turnIn: "Entregue a", levels: "Níveis recomendados",
    droppedBy: "Saque de", inside: "Dentro de", requires: "Requer" },
  "zh-Hans": { starts: "起始：", turnIn: "交给：", levels: "建议等级",
    droppedBy: "掉落自：", inside: "位于：", requires: "需要：" },
  "zh-Hant": { starts: "起始：", turnIn: "交給：", levels: "建議等級",
    droppedBy: "掉落自：", inside: "位於：", requires: "需要：" },
};
const itemIds = { "Nibbled-On Book": 247834, "Ripped Missive": 265476,
  "Dull Storm Orb": 277661, "Aged Envelope": 4881,
  "Eye of Burning Shadow": 4903, "Benedict's Key": 4882 };
const instanceIdByName = new Map(Object.entries(english.map.instanceCoverage.names)
  .map(([id, name]) => [name, id]));

for (const [language, gameLocale] of Object.entries(packs)) {
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const mapEntityPack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  const term = (key, original) => {
    const index = sourceIndices.get(key);
    if (index === undefined || source.values[index] !== original || !pack.values[index]) {
      throw new Error(`${language}: missing client term ${key}/${original}`);
    }
    return pack.values[index];
  };
  const item = (name) => itemIds[name] ? term(`ItemSparse:${itemIds[name]}:4`, name) : name;
  const faction = (name) => term(`Faction:${name === "Alliance" ? 469 : 67}:0`, name);
  const word = words[language];
  const clientNames = new Map();
  const npcNames = new Map();
  const dungeonNames = new Map();
  const poiNames = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    const [table, , field] = source.keys[index].split(":");
    if (table === "AreaPOI" && field === "0" && pack.values[index]) {
      const names = poiNames.get(source.values[index]) ?? new Set();
      names.add(pack.values[index]);
      poiNames.set(source.values[index], names);
    }
    if (table === "LFGDungeons" && field === "0" && pack.values[index]) {
      const names = dungeonNames.get(source.values[index]) ?? new Set();
      names.add(pack.values[index]);
      dungeonNames.set(source.values[index], names);
    }
    if (!(["AreaTable", "Map"].includes(table) && field === "1") &&
      !(table === "LFGDungeons" && field === "0") &&
      !(table === "ItemSparse" && field === "4")) continue;
    const names = clientNames.get(source.values[index]) ?? new Set();
    if (pack.values[index]) names.add(pack.values[index]);
    clientNames.set(source.values[index], names);
  }
  for (let index = 0; index < mapEntitySource.keys.length; index += 1) {
    if (!mapEntitySource.keys[index].startsWith("Creature:") ||
      !mapEntityPack.values[index]) continue;
    const names = npcNames.get(mapEntitySource.values[index]) ?? new Set();
    names.add(mapEntityPack.values[index]);
    npcNames.set(mapEntitySource.values[index], names);
  }
  const punctuation = language.startsWith("zh") ? "" : " ";
  const prefix = (text, name) => language === "fr" && text.endsWith(" de") &&
    /^[AEIOUYÂÉÈÊËÎÏÔÖÙÛÜ]/i.test(name)
    ? `${text.slice(0, -2)}d’${name}` : `${text}${punctuation}${name}`;
  const npcName = (id, field, name) => english.map.questMarkers[id]?.[field] === name
    ? locale.map.questMarkers[id]?.[field] : undefined;
  const localize = (value, id) => {
    const range = /^Suggested levels: (\d+–\d+)$/.exec(value);
    if (range) return `${word.levels}: ${range[1]}`;
    const dropped = /^Starts with (.+) \(([Dd]ropped by) (.+)\)$/.exec(value);
    if (dropped) return `${prefix(word.starts, item(dropped[1]))} (${prefix(word.droppedBy, dropped[3])})`;
    if (value === "Starts with Aged Envelope (Inside Benedict's Chest, Requires Benedict's Key)") {
      return `${prefix(word.starts, item("Aged Envelope"))} (${prefix(word.inside, "Benedict's Chest")}, ${prefix(word.requires, item("Benedict's Key"))})`;
    }
    if (value.startsWith("Starts with ")) {
      const name = value.slice("Starts with ".length);
      return prefix(word.starts, npcName(id, "startsAt", name) ?? item(name));
    }
    if (value.startsWith("Turn in to ")) {
      const name = value.slice("Turn in to ".length);
      return prefix(word.turnIn, npcName(id, "endsAt", name) ?? name);
    }
    if (value === "Alliance" || value === "Horde") return faction(value);
    const namedFaction = /^(.*) · (Alliance|Horde)$/.exec(value);
    if (namedFaction) {
      const reviewed = reviewedNpcDetails[value]?.[language]?.value;
      if (reviewed) return reviewed;
      const names = npcNames.get(namedFaction[1]);
      const name = names?.size === 1 ? [...names][0] : namedFaction[1];
      return `${name} · ${faction(namedFaction[2])}`;
    }
    return null; // A server-side NPC or quest proper name without a client locale entry.
  };
  locale.map.mapgenieCommunity ??= {};
  let count = 0;
  for (const [id, record] of Object.entries(english.map.mapgenieCommunity)) {
    const officialNames = clientNames.get(record.name);
    const dungeonName = (record.description?.startsWith("Suggested levels: ") ||
      (!record.description && !record.detail)) &&
      dungeonNames.get(record.name)?.size === 1
      ? [...dungeonNames.get(record.name)][0] : undefined;
    const officialName = officialNames?.size === 1 ? [...officialNames][0] : undefined;
    const poiName = poiNames.get(record.name)?.size === 1
      ? [...poiNames.get(record.name)][0] : undefined;
    const instanceId = instanceIdByName.get(record.name);
    const sameInstance = instanceId && locale.map.instanceCoverage.names?.[instanceId];
    const categoryName = record.name === "Mailbox" ? locale.map.categories.mailbox : undefined;
    const name = officialName ?? dungeonName ?? poiName ?? sameInstance ?? categoryName;
    // Official names can intentionally have the same spelling as enUS.
    if (name) {
      if (officialName || !locale.map.mapgenieCommunity[id]?.name) {
        locale.map.mapgenieCommunity[id] ??= {};
        locale.map.mapgenieCommunity[id].name = name;
        count += 1;
      }
    }
    for (const field of ["detail", "description"]) if (record[field]) {
      const translated = localize(record[field], id);
      if (translated === null) continue;
      locale.map.mapgenieCommunity[id] ??= {};
      locale.map.mapgenieCommunity[id][field] = translated;
      count += 1;
    }
    const marker = english.map.questMarkers[id];
    const communityName = locale.map.mapgenieCommunity[id]?.name;
    if (marker?.name === record.name && communityName && !locale.map.questMarkers[id]?.name) {
      locale.map.questMarkers[id] ??= {};
      locale.map.questMarkers[id].name = communityName;
      count += 1;
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: map hints are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${count} map hints`);
}
