/** Fill high-confidence map proper names from the installed Forever client's locale tables. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await readJson("src/i18n/locales/en.json");
const source = await readJson("public/data/locales/wow-forever/source.json");
const sourceKeyIndex = new Map(source.keys.map((key, index) => [key, index]));
const alternateFlightPoints = await readJson(
  "data/map-context-localization/reviewed-alternate-client-flight-points.json");
const alternateFlightPointIds = new Set(alternateFlightPoints.map((row) =>
  `${row.language}/${row.id}`));
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

function add(target, path, value) {
  // A client-verified proper name can legitimately match enUS in a locale.
  if (!value) return false;
  let node = target;
  for (const key of path.slice(0, -1)) node = node[key] ??= {};
  const leaf = path.at(-1);
  if (node[leaf] !== undefined) return false;
  node[leaf] = value;
  return true;
}

function setClientName(target, path, value) {
  if (!value) return false;
  let node = target;
  for (const key of path.slice(0, -1)) node = node[key] ??= {};
  const leaf = path.at(-1);
  if (node[leaf] === value) return false;
  node[leaf] = value;
  return true;
}

const professionSkillIds = {
  Alchemy: 171, Blacksmithing: 164, Enchanting: 333, Engineering: 202,
  Herbalism: 182, Leatherworking: 165, Mining: 186, Skinning: 393,
  Tailoring: 197, Cooking: 185, "First Aid": 129, Fishing: 356,
};
const frenchSettlementRegionKeys = {
  Westfall: "AreaTable:16149:1",
  "Elwynn Forest": "AreaTable:12:1",
  Duskwood: "AreaTable:16148:1",
  Desolace: "AreaTable:405:1",
};
const questNpcRegionTermKeys = {
  Ironforge: "AreaTable:1537:1",
  "The Forlorn Cavern": "WMOAreaTable:15634:0",
  "Hall of Explorers": "WMOAreaTable:15583:0",
  "Tinker Town": "WMOAreaTable:15678:0",
  "Stormwind City": "AreaTable:1519:1",
  "Royal Gallery": "WMOAreaTable:14618:0",
  "The Library": "WMOAreaTable:15660:0",
  Darnassus: "AreaTable:1657:1",
  Orgrimmar: "AreaTable:1637:1",
  "Cleft of Shadow": "WMOAreaTable:32214:0",
  "Old Town": "WMOAreaTable:34470:0",
  "Dun Morogh": "AreaTable:1:1",
  Kharanos: "AreaTable:131:1",
  "Dwarven District": "WMOAreaTable:43646:0",
  "Grommash Hold": "WMOAreaTable:13918:0",
  Undercity: "AreaTable:1497:1",
  "Royal Quarter": "WMOAreaTable:15148:0",
};

function dictionary(table, field, pack) {
  const names = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    if (!source.keys[index].startsWith(`${table}:`) ||
      Number(source.keys[index].split(":")[2]) !== field || !pack.values[index]) continue;
    const original = source.values[index];
    if (!names.has(original)) names.set(original, new Set());
    names.get(original).add(pack.values[index]);
  }
  return (original) => {
    const choices = names.get(original);
    return choices?.size === 1 ? [...choices][0] : null;
  };
}

let written = 0;
for (const [language, gameLocale] of Object.entries(locales)) {
  const pack = await readJson(`public/data/locales/wow-forever/${gameLocale}.json`);
  const path = `src/i18n/locales/${language}.json`;
  const target = await readJson(path);
  const area = dictionary("AreaTable", 1, pack);
  const settlementRegion = (name) => {
    const direct = area(name);
    if (direct || language !== "fr") return direct;
    // Multiple AreaTable rows disagree in French; use the reviewed zone row.
    const key = frenchSettlementRegionKeys[name];
    const index = sourceKeyIndex.get(key);
    return index !== undefined && source.values[index] === name ? pack.values[index] : null;
  };
  const item = dictionary("ItemSparse", 4, pack);
  const placedObject = dictionary("GameObjects", 0, pack);
  const building = dictionary("WMOAreaTable", 0, pack);
  const spellFocus = dictionary("SpellFocusObject", 0, pack);
  const lockType = dictionary("LockType", 1, pack);
  const encounterNpc = dictionary("DungeonEncounter", 0, pack);
  const factionNpc = dictionary("Faction", 0, pack);
  const className = dictionary("ChrClasses", 0, pack);
  const professionName = (name) => {
    const id = professionSkillIds[name];
    if (!id) return null;
    const index = sourceKeyIndex.get(`SkillLine:${id}:0`);
    return source.values[index] === name ? pack.values[index] : null;
  };
  let added = 0;
  if (language === "de" && english.map.transportStops.places.stormwind === "Stormwind") {
    const index = sourceKeyIndex.get("AreaTable:1519:1");
    if (index === undefined || source.values[index] !== "Stormwind City" || !pack.values[index]) {
      throw new Error("German Stormwind transport label does not match the client");
    }
    added += Number(add(target, ["map", "transportStops", "places", "stormwind"], pack.values[index]));
  }

  for (const [field, table, column] of [
    ["instanceEncounters", "DungeonEncounter", 0],
    ["publishedAreaNames", "AreaTable", 1],
    ["thunderBluffSigns", "GameObjects", 0],
    ["publishedFlightPoints", "TaxiNodes", 0],
  ]) {
    for (const [id, name] of Object.entries(english.map[field])) {
      const index = sourceKeyIndex.get(`${table}:${id}:${column}`);
      if (index !== undefined && source.values[index] === name) {
        if (field === "publishedFlightPoints" &&
          alternateFlightPointIds.has(`${language}/${id}`)) continue;
        const path = ["map", field, id];
        added += Number(field === "publishedFlightPoints"
          ? setClientName(target, path, pack.values[index])
          : add(target, path, pack.values[index]));
      }
    }
  }
  for (const field of ["publishedSettlements", "publishedBattlegroundObjectives",
    "publishedPointsOfInterest", "publishedWorldObjectives"]) {
    for (const [id, name] of Object.entries(english.map[field])) {
      const index = sourceKeyIndex.get(`AreaPOI:${id}:0`);
      if (index === undefined || source.values[index] !== name) continue;
      const path = ["map", field, id];
      if (field === "publishedWorldObjectives" ||
        (field === "publishedPointsOfInterest" && id === "1248")) {
        added += Number(setClientName(target, path, pack.values[index]));
      } else added += Number(add(target, path, pack.values[index]));
    }
  }

  for (const field of ["publishedSettlements", "publishedSettlementRegions",
    "publishedBattlegroundObjectives", "publishedPointsOfInterest"]) {
    for (const [id, name] of Object.entries(english.map[field])) {
      added += Number(add(target, ["map", field, id],
        (field === "publishedSettlementRegions" ? settlementRegion(name) : area(name)) ??
        (field === "publishedPointsOfInterest" ? placedObject(name) : null)));
    }
  }
  for (const [id, name] of Object.entries(english.map.gatherableTypes)) {
    added += Number(add(target, ["map", "gatherableTypes", id], item(name)));
  }
  for (const [id, record] of Object.entries(english.map.mapgenieCommunity)) {
    if (record.name === "General Goods") {
      added += Number(add(target, ["map", "mapgenieCommunity", id, "name"], building(record.name)));
    }
  }
  for (const [parent, field] of [["transportStops", "places"], ["books", "regions"]]) {
    for (const [id, name] of Object.entries(english.map[parent][field])) {
      added += Number(add(target, ["map", parent, field, id], area(name)));
    }
  }
  for (const [id, name] of Object.entries(english.map.questNpcs.regions)) {
    added += Number(add(target, ["map", "questNpcs", "regions", id], building(name)));
    const terms = name.split(", ");
    if (terms.length !== 2) continue;
    const indices = terms.map((term) => sourceKeyIndex.get(questNpcRegionTermKeys[term]));
    if (indices.some((index, part) => index === undefined ||
      source.values[index] !== terms[part] || !pack.values[index])) continue;
    const translatedTerms = indices.map((index) => pack.values[index]);
    const path = ["map", "questNpcs", "regions", id];
    const current = target.map.questNpcs.regions[id];
    const partiallyTranslated = [name,
      `${translatedTerms[0]}, ${terms[1]}`,
      `${terms[0]}, ${translatedTerms[1]}`];
    const translated = translatedTerms.join(", ");
    added += Number(partiallyTranslated.includes(current)
      ? setClientName(target, path, translated)
      : add(target, path, translated));
  }
  for (const [id, record] of Object.entries(english.map.classTrainers)) {
    if (record.class) added += Number(add(target, ["map", "classTrainers", id, "class"], className(record.class)));
  }
  for (const [id, name] of Object.entries(english.map.trainerFilters["class-trainer"])) {
    added += Number(add(target, ["map", "trainerFilters", "class-trainer", id], className(name)));
  }
  for (const [id, name] of Object.entries(english.map.trainerFilters["profession-trainer"])) {
    added += Number(setClientName(target, ["map", "trainerFilters", "profession-trainer", id], professionName(name)));
  }
  for (const [id, name] of Object.entries(english.professions.names)) {
    added += Number(setClientName(target, ["professions", "names", id], professionName(name)));
  }
  for (const [id, record] of Object.entries(english.map.questMarkers)) {
    // Some quest titles are the exact name of an item or area in the client.
    // Reuse only an unambiguous official term; quest/NPC text absent from the
    // client stays unresolved instead of receiving a guessed translation.
    added += Number(add(target, ["map", "questMarkers", id, "name"],
      item(record.name) ?? area(record.name) ??
      (record.name === "Gahz'ridian" ? lockType(record.name) : null)));
    for (const field of ["startsAt", "endsAt"]) {
      if (record[field]) {
        added += Number(add(target, ["map", "questMarkers", id, field],
          item(record[field]) ?? encounterNpc(record[field]) ?? factionNpc(record[field]) ??
          spellFocus(record[field])));
      }
    }
    if (record.requiredClass) {
      const classes = record.requiredClass.split(", ").map(className);
      if (classes.every(Boolean)) {
        const separator = language.startsWith("zh") ? "、" : ", ";
        added += Number(add(target, ["map", "questMarkers", id, "requiredClass"], classes.join(separator)));
      }
    }
    const profession = record.requiredProfession?.match(/^(.+) \((\d+)\)$/);
    if (profession && professionName(profession[1])) {
      added += Number(setClientName(target, ["map", "questMarkers", id, "requiredProfession"],
        `${professionName(profession[1])} (${profession[2]})`));
    }
  }
  if (added) await writeFile(join(root, path), JSON.stringify(target, null, 2) + "\n");
  written += added;
  console.log(`${language}: ${added} new map names from ${gameLocale}`);
}
console.log(`Added ${written} client-verified map name entries.`);
