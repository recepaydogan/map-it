/** Replace bare English quest/NPC lists in guides with unambiguous reviewed game names. */
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
  read("data/guide-localization/reviewed-invariant-game-names.json"),
]);
const reviewedInvariant = catalogs.at(-1);
const warlockClassQuest = await read("data/guide-localization/reviewed-warlock-class-quest-titles.json");
if (warlockClassQuest.source.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  warlockClassQuest.guideId !== "leveling-warlock" || warlockClassQuest.questId !== 1485 ||
  warlockClassQuest.en !== "Vile Familiars" || warlockClassQuest["pt-BR"] !== "Familiares Vis") {
  throw new Error("Reviewed Warlock quest title changed");
}
if (reviewedInvariant.source.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  Object.entries(reviewedInvariant.names).some(([name, record]) =>
    Object.entries(record).some(([key, value]) => !["npcIds", "questIds"].includes(key) && value !== name))) {
  throw new Error("Guide invariant game names are invalid");
}
const values = new Map();
const questValues = new Map();
const npcValues = new Map();
for (const catalog of catalogs) for (const [english, record] of Object.entries(catalog.titles ?? catalog.names)) {
  const byLanguage = values.get(english) ?? new Map();
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    if (!record[language]) continue;
    const candidates = byLanguage.get(language) ?? new Set();
    candidates.add(record[language]);
    byLanguage.set(language, candidates);
  }
  values.set(english, byLanguage);
  if (catalog.titles) {
    const questByLanguage = questValues.get(english) ?? new Map();
    for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
      if (!record[language]) continue;
      const candidates = questByLanguage.get(language) ?? new Set();
      candidates.add(record[language]);
      questByLanguage.set(language, candidates);
    }
    questValues.set(english, questByLanguage);
  }
  if (catalog.names) {
    const npcByLanguage = npcValues.get(english) ?? new Map();
    for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
      if (!record[language]) continue;
      const candidates = npcByLanguage.get(language) ?? new Set();
      candidates.add(record[language]);
      npcByLanguage.set(language, candidates);
    }
    npcValues.set(english, npcByLanguage);
  }
}
const clientSource = await read("public/data/locales/wow-forever/source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const questIndices = new Map();
for (const [index, key] of entitySource.keys.entries()) {
  if (!key.startsWith("Quest:")) continue;
  const english = entitySource.values[index];
  const indices = questIndices.get(english) ?? [];
  indices.push(index);
  questIndices.set(english, indices);
}
const gameCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const entityLocales = new Map(await Promise.all(Object.entries(gameCodes).map(async ([language, code]) =>
  [language, await read(`public/data/locales/wow-forever/map-entity-${code}.json`)])));
if (entitySource.keys.length !== entitySource.values.length ||
  [...entityLocales.values()].some((pack) => pack.values.length !== entitySource.keys.length)) {
  throw new Error("Guide quest locale packs do not match their source indices");
}
const gameQuestCandidates = (english, language) => {
  const pack = entityLocales.get(language);
  const translated = [...new Set((questIndices.get(english) ?? [])
    .map((index) => pack.values[index]).filter(Boolean))];
  if (translated.length === 1 && translated[0] !== english) return new Set(translated);
  // The Portuguese quest records for Desperate Prayer differ only in case.
  // Five of six use this spelling; keep the quest title distinct from spells.
  if (english === "Desperate Prayer" && language === "pt-BR" &&
    translated.length === 2 && translated.includes("Prece desesperada") &&
    translated.includes("Prece Desesperada")) return new Set(["Prece desesperada"]);
  if (english === "Arcane Feedback" && language === "pt-BR" &&
    translated.length === 2 && translated.includes("Fluxo arcano") &&
    translated.includes("Fluxo Arcano")) return new Set(["Fluxo Arcano"]);
  // The Mexican client has no quest record for this title. Its spell name
  // agrees with the reviewed Spanish Classic quest title.
  if (english === "Devouring Plague" && language === "es-MX") {
    return questValues.get(english)?.get("es");
  }
  return questValues.get(english)?.get(language);
};
const clientKeys = new Map(clientSource.keys.map((key, index) => [key, index]));
const clientPlaces = {
  "Dun Morogh": "AreaTable:1:1",
  Teldrassil: "AreaTable:141:1",
  Mulgore: "AreaTable:215:1",
  Ironforge: "AreaTable:1537:1",
};
for (const [english, key] of Object.entries(clientPlaces)) {
  const index = clientKeys.get(key);
  if (index === undefined || clientSource.values[index] !== english) {
    throw new Error(`Guide place does not match the client: ${english}`);
  }
  const byLanguage = values.get(english) ?? new Map();
  for (const [language, gameLocale] of Object.entries({ de: "deDE", es: "esES", "es-MX": "esMX",
    fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" })) {
    const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
    if (!pack.values[index]) continue;
    const candidates = byLanguage.get(language) ?? new Set();
    candidates.add(pack.values[index]);
    byLanguage.set(language, candidates);
  }
  values.set(english, byLanguage);
}
const listsByGuide = { "leveling-rogue": [
  "Sten Stoutarm, Dun Morogh",
  "Conservator Ilthalaine, Teldrassil",
  "Hulfdan Blackbeard, Ironforge",
  "The Apple Falls, Destiny Calls",
  "To Hulfdan!, Kingly Shakedown",
  "Erion Shadewhisper, Erion's Behest",
  "SI:7, Redridge Rendezvous",
  "To Orgrimmar!, Zando'zan, Wrenix of Ratchet",
  "Find the Shattered Hand, Fenwick Thatros",
  "Mathias and the Defias, The Touch of Zanzil",
  "Deep Cover, The Shattered Salute",
], "leveling-paladin": ["Lord Grayson Shadowbreaker"],
  "leveling-priest": ["Sten Stoutarm, Dun Morogh", "Conservator Ilthalaine, Teldrassil",
    "Laurna Morninglight, Teldrassil"],
  "leveling-shaman": ["Seer Ravenfeather, Mulgore"],
  "leveling-warlock": ["The Stolen Tome, Beginnings, Vile Familiars, Piercing the Veil"] };
// These names occur inside translated sentences and table cells, rather than bare lists.
// Keep the scope explicit so a similarly spelled word in another guide is not changed.
const embeddedNamesByGuide = {
  "getting-started": { quests: ["Body and Heart"] },
  "first-dungeon": {
    quests: ["Red Silk Bandanas", "The Defias Brotherhood"],
    npcs: ["Scout Riell", "Maur Grimtotem", "Nalpak"],
  },
  leveling: {
    quests: ["Exploring the Horde"],
    npcs: ["Lady Sylvanas Windrunner"],
  },
  "leveling-paladin": {
    quests: ["The Tome of Nobility"],
    npcs: [
      "Azar Stronghammer", "Brandur Ironhammer", "Brother Wilhelm", "Daphne Stilwell",
      "Duthorian Rall", "Gazin Tenorm", "Henze Faulk", "John Turner",
      "Jordan Stilwell", "Muiredon Battleforge", "Narm Faulk", "Sten Stoutarm",
      "Stephanie Turner", "Tiza Battleforge",
    ],
  },
  "leveling-druid": { npcs: [
    "Alanndarian Nightsong", "Conservator Ilthalaine", "Dendrite Starblaze",
    "Great Cat Spirit", "Grull Hawkwind", "Mathrengyl Bearwalker",
    "Tajarri", "Tonga Runetotem", "Turak Runetotem",
  ] },
  "leveling-hunter": { npcs: [
    "Ayanna Everstride", "Conservator Ilthalaine", "Dazalar", "Gornek",
    "Grif Wildheart", "Grull Hawkwind", "Jen'shan", "Lanka Farshot",
    "Sten Stoutarm", "Thorgas Grimson", "Thotar", "Yaw Sharpmane",
  ] },
  "leveling-mage": {
    quests: ["Speak with Deino", "Underground Assault", "Deviate Eradication",
      "Gathering Materials"],
    npcs: [
      "Anastasia Hartwell", "Cain Firesong", "Gornek", "High Sorcerer Andromath", "Jennea Cannon",
      "Josef Gregorian", "Kil'hala", "Magis Sparkmantle", "Shadow Priest Sarvis",
      "Sten Stoutarm", "Un'Thuwa", "Uthel'nay", "Wynne Larson", "Zaldimar Wefhellt",
    ],
  },
  "leveling-priest": { quests: [
    "Arcane Feedback", "Desperate Prayer", "Deviate Eradication",
    "Devouring Plague", "Elune's Grace", "Hex of Weakness",
    "Shadowguard", "Touch of Weakness", "Underground Assault",
  ] },
  "leveling-rogue": {
    quests: ["Alther's Mill", "Erion Shadewhisper", "Klaven's Tower", "Wrenix of Ratchet"],
    npcs: [
    "Agent Kearnen", "Andron Gant", "Conservator Ilthalaine", "Gornek",
    "Fenwick Thatros", "Hogral Bakkan", "Hulfdan Blackbeard",
    "Jannok Breezesong", "Kaplak", "Keryn Sylvius", "Lucius", "Marion Call",
    "Master Mathias Shaw", "Mennet Carkad", "Onin MacHammar", "Renzik \"The Shiv\"",
    "Serge Hinott", "Shadow Priest Sarvis", "Shenthul", "Sten Stoutarm",
    "Syurna", "Taskmaster Fizzule", "Therzok", "Wrenix the Wretched", "Zando'zan",
  ] },
  "leveling-shaman": { npcs: [
    "Beram Skychaser", "Brine", "Canaga Earthcaller", "Gornek", "Grull Hawkwind",
    "Islen Waterseer", "Kranal Fiss", "Minor Manifestation of Earth",
    "Narm Skychaser", "Searn Firewarder", "Seer Ravenfeather",
    "Swart", "Telf Joolam", "Xanis Flameweaver",
  ] },
  "leveling-warlock": {
    quests: ["Creature of the Void", "Devourer of Souls", "Seeking Strahad", "Tome of the Cabal"],
    npcs: [
      "Ageron Kargal", "Alamar Grimm", "Carendin Halgar", "Doan Karhan",
      "Drusilla La Salle", "Gakin the Darkbinder",
      "Gan'rul Bloodeye", "Godrick Farsan", "Gornek", "Jorah Annison",
      "Lago Blackwrench", "Ophek", "Remen Marcot", "Shadow Priest Sarvis",
      "Sten Stoutarm", "Strahad Farsan",
      "Surena Caledon", "Takar the Seer", "Venya Marthand",
    ],
  },
  "leveling-warrior": { npcs: [
    "Gornek", "Klockmort Spannerspan", "Mathiel", "Muren Stormpike",
    "Sorek", "Thun'grim Firegaze", "Tormus Deepforge", "Uzzek", "Veteran Uzzek",
    "Wu Shen", "Yorus Barleybrew",
  ] },
  professions: { npcs: [
    "Adele Fielder", "Alanna Raveneye", "Armand Cromwell", "Arnok", "Arnold Leland",
    "Aska Mistrunner", "Astaia", "Baelann Swiftcurrent", "Balthus Stoneflayer", "Basil Frye",
    "Betty Quin", "Bowen Brisboise", "Brek Stonehoof", "Brock Stoneseeker", "Byancie",
    "Brom Killian", "Bronk Guzzlegear", "Carolai Anise", "Chaw Stronghide",
    "Clyde Kellen", "Cyndra Kindwhisper", "Dan Golthas", "Dane Lindgren",
    "Daryl Riknussun", "Doctor Martin Felben", "Dwukk", "Eldrin", "Eunice Burch",
    "Faruza", "Fenn Fairweather", "Gelman Stonehand", "Geofram Bouldertoe",
    "Ghak Healtouch", "Graham Van Talen",
    "Gremlock Pilsnor", "Gretta Finespindle", "Grimnur Stonebrand", "Groum Stonebeard",
    "Helene Peltskinner", "Ishlee Breezewhisper", "Jandi", "Jemma Quikswitch",
    "Jenna Lemkenilli", "Kah Mistrunner", "Kamari", "Kil'hala", "Killian Hagey",
    "Kitta Firewind", "Komin Winterhoof", "Krunn", "Kurdram Stonehammer",
    "Lau'Tiki", "Lawrence Schneider", "Lee Brown", "Lumak", "Makaru", "Malcomb Wynn",
    "Malorne Bladeleaf", "Maris Granger", "Martha Alliestar", "Mary Edras",
    "Mendalass Tattermend", "Miao'zan", "Michelle Belle", "Mishiki", "Mooranta",
    "Mot Dawnstrider", "Mukdrak", "Nadyia Maneweaver", "Nat Pagle", "Nissa Firestone",
    "Nurse Neela", "Pand Stonebinder", "Paxton Ganter",
    "Pyall Silentstride", "Radnaal Maneweaver", "Rand Rhobart", "Randal Worth",
    "Rawrk", "Reyna Stonebranch", "Shaina Fuller", "Shelene Rhobart", "Smith Argus",
    "Snang", "Sprite Jumpsprocket", "Stephen Ryback", "Tannysa", "Tel'Athir",
    "Thamner Pol", "Thonys Pillarstone", "Thrag Stonehoof", "Thuwd", "Tinkerwiz",
    "Tognus Flintfire", "Tomas", "Trianna", "Twizwick Sprocketgrind", "Ug'thok",
    "Uthan Stillwater", "Uthrar Threx", "Vance Undergloom", "Victor Ward",
    "Vira Younghoof", "Vosur Brakthel", "Whuut", "Yarr Hammerstone",
    "Yonn Deepcut", "Zamja", "Zarrin",
  ] },
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const replaceVisibleName = (html, english, translated) => {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(english)}(?=$|[^\\p{L}\\p{N}'’])`, "gu");
  let replacements = 0;
  const output = html.split(/(<[^>]*>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    return part.replace(pattern, (_match, prefix) => {
      replacements += 1;
      return prefix + translated;
    });
  }).join("");
  return { output, replacements };
};
const sourcePatterns = new Map();
for (const [id, englishLists] of Object.entries(listsByGuide)) {
  const source = await read(`public/data/guides/${id}.json`);
  for (const text of englishLists) {
    const parts = text.split(/,\s*/);
    const pattern = source.html.includes(`>${text}<`) ? "plain"
      : parts.length === 2 && source.html.includes(`>${parts[0]}</a>, ${parts[1]}<`)
        ? "linked-pair" : undefined;
    if (!pattern) throw new Error(`Source guide list changed: ${id}/${text}`);
    sourcePatterns.set(`${id}:${text}`, pattern);
  }
}
const check = process.argv.includes("--check");
for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
  let count = 0;
  for (const id of new Set([...Object.keys(listsByGuide), ...Object.keys(embeddedNamesByGuide)])) {
    const englishLists = listsByGuide[id] ?? [];
    const path = join(root, `public/data/guides/locales/${language}/${id}.json`);
    const raw = await readFile(path, "utf8");
    const target = JSON.parse(raw);
    for (const original of englishLists) {
    const translated = original.split(/,\s*/).map((name) => {
      // This bare guide cell names the NPC. Some same-named quests use different wording.
      const candidates = name === "Lord Grayson Shadowbreaker"
        ? npcValues.get(name)?.get(language) ?? values.get(name)?.get(language)
        : id === warlockClassQuest.guideId && name === warlockClassQuest.en && language === "pt-BR"
          ? new Set([warlockClassQuest[language]]) : values.get(name)?.get(language);
      return candidates?.size === 1 ? [...candidates][0] : undefined;
    });
    if (translated.some((value) => !value)) continue;
    const pattern = sourcePatterns.get(`${id}:${original}`);
    const from = pattern === "linked-pair" ? `>${original.split(/,\s*/)[0]}</a>, ${original.split(/,\s*/)[1]}<`
      : `>${original}<`;
    const to = pattern === "linked-pair" ? `>${translated[0]}</a>, ${translated[1]}<`
      : `>${translated.join(", ")}<`;
    const occurrences = target.html.split(from).length - 1;
    if (occurrences > 1) throw new Error(`${language}: repeated guide list: ${original}`);
    if (occurrences === 1 && from !== to) {
        target.html = target.html.replace(from, to);
        count += 1;
      }
    }
    const embedded = embeddedNamesByGuide[id];
    if (embedded) {
      for (const [kind, names] of Object.entries(embedded)) {
        for (const name of names) {
          // Some NPCs also have same-named quests. Their verified quest title can
          // fill a locale missing from the NPC catalog for this explicit guide name.
          const candidates = kind === "npcs"
            ? npcValues.get(name)?.get(language) ?? values.get(name)?.get(language)
            : gameQuestCandidates(name, language);
          if (candidates?.size !== 1) continue;
          const translated = [...candidates][0];
          if (translated === name) continue;
          const result = replaceVisibleName(target.html, name, translated);
          target.html = result.output;
          count += result.replacements;
        }
      }
    }
    if (id === "leveling-druid") {
      // The German area and Teleport spell are "Moonglade" in the client, while
      // the same-named quest in this table has the localized title "Mondlichtung".
      const quest = gameQuestCandidates("Moonglade", language);
      const from = ", Moonglade, ";
      const occurrences = target.html.split(from).length - 1;
      if (occurrences > 1) throw new Error(`${language}: repeated Druid quest-list title`);
      if (occurrences === 1 && quest?.size === 1) {
        const translated = [...quest][0];
        if (translated !== "Moonglade") {
          target.html = target.html.replace(from, `, ${translated}, `);
          count += 1;
        }
      }
    }
    const output = JSON.stringify(target) + (raw.endsWith("\n") ? "\n" : "");
    if (check) {
      if (output !== raw) throw new Error(`${language}/${id}: guide game names are stale`);
    } else if (output !== raw) await writeFile(path, output);
  }
  console.log(`${language}: ${count} guide game-name occurrences localized`);
}
