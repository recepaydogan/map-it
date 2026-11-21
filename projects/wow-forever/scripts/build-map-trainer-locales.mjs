/** Render trainer roles with the installed client's class, profession and faction names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const classIds = { Druid: 11, Hunter: 3, Mage: 8, Paladin: 2, Priest: 5,
  Rogue: 4, Shaman: 7, Warlock: 9, Warrior: 1 };
const raceKeys = { human: "ChrRaces:1:2", dwarf: "ChrRaces:3:2",
  nightelf: "ChrRaces:4:2", gnome: "ChrRaces:7:2", orc: "ChrRaces:2:2",
  undead: "ChrRaces:5:2", tauren: "ChrRaces:6:2", troll: "ChrRaces:8:2",
  skyborne: "ChrRaces:95:4" };
const skillIds = { Alchemy: 171, Blacksmithing: 164, Cooking: 185, Enchanting: 333,
  Engineering: 202, "First Aid": 129, Fishing: 356, Herbalism: 182,
  Leatherworking: 165, Mining: 186, Skinning: 393, Tailoring: 197 };
const occupationSkills = { Alchemist: "Alchemy", Blacksmith: "Blacksmithing", Cook: "Cooking",
  Enchanter: "Enchanting", Engineer: "Engineering", Fisher: "Fishing",
  Fisherman: "Fishing", Herbalist: "Herbalism", Leatherworker: "Leatherworking",
  Medic: "First Aid", Miner: "Mining", Physician: "First Aid", Skinner: "Skinning",
  Tailor: "Tailoring" };
const words = {
  de: { trainer: "Ausbilder", ranks: ["Meister", "Experte", "Geselle", "Lehrling", "Meister"],
    special: ["Dämonenausbilder", "Tierausbilder", "Waffenmeister", "Meistermagier", "Portalausbilder", "Hohepriester"] },
  es: { trainer: "Instructor", ranks: ["Artesano", "Experto", "Oficial", "Aprendiz", "Maestro"],
    special: ["Instructor de demonios", "Instructor de mascotas", "Maestro de armas", "Maestro mago", "Instructor de portales", "Sumo sacerdote"] },
  "es-MX": { trainer: "Instructor", ranks: ["Artesano", "Experto", "Oficial", "Aprendiz", "Maestro"],
    special: ["Instructor de demonios", "Instructor de mascotas", "Maestro de armas", "Maestro mago", "Instructor de portales", "Sumo sacerdote"] },
  fr: { trainer: "Formateur", ranks: ["Artisan", "Expert", "Compagnon", "Débutant", "Maître"],
    special: ["Formateur de démons", "Dresseur de familiers", "Maître d'armes", "Maître mage", "Formateur de portails", "Grand prêtre"] },
  ko: { trainer: "훈련사", ranks: ["장인", "전문가", "숙련공", "초급", "대가"],
    special: ["악마 훈련사", "소환수 훈련사", "무기 전문가", "대마법사", "차원문 훈련사", "대사제"] },
  "pt-BR": { trainer: "Instrutor", ranks: ["Artífice", "Perito", "Profissional", "Aprendiz", "Mestre"],
    special: ["Instrutor de demônios", "Instrutor de mascotes", "Mestre de armas", "Mestre mago", "Instrutor de portais", "Sumo sacerdote"] },
  "zh-Hans": { trainer: "训练师", ranks: ["工匠", "专家", "熟练", "初级", "大师"],
    special: ["恶魔训练师", "宠物训练师", "武器大师", "大法师", "传送门训练师", "大祭司"] },
  "zh-Hant": { trainer: "訓練師", ranks: ["工匠", "專家", "熟練", "初級", "大師"],
    special: ["惡魔訓練師", "寵物訓練師", "武器大師", "大法師", "傳送門訓練師", "大祭司"] },
};
const rankNames = ["Artisan", "Expert", "Journeyman", "Junior", "Master"];
const specialNames = ["Demon Trainer", "Pet Trainer", "Weapon Master", "Master Mage", "Portal Trainer", "High Priest"];
// Checked against the client-localized Shadoweave Pants (ItemSparse:10002:4).
const shadoweaveNames = { de: "Schattenzwirn", es: "tejido de sombras", "es-MX": "tejido de sombra",
  fr: "tisse-ombre", ko: "그림자매듭", "pt-BR": "Umbratrama", "zh-Hans": "暗纹", "zh-Hant": "暗紋" };
const signRoles = {
  de: ["Bank und Auktionshaus", "Gasthaus", "Handwerkergilde", "Hafenbehörde", "Zentralhalle", "Waffenhalle"],
  es: ["Banco y casa de subastas", "Posada", "Gremio de artesanos", "Autoridad portuaria", "Sala central", "Sala de armas"],
  "es-MX": ["Banco y casa de subastas", "Posada", "Gremio de artesanos", "Autoridad portuaria", "Sala central", "Sala de armas"],
  fr: ["Banque et hôtel des ventes", "Auberge", "Guilde des artisans", "Autorité portuaire", "Salle centrale", "Salle d'armes"],
  ko: ["은행 및 경매장", "여관", "장인 길드", "항만 관리소", "중앙 홀", "무기 전당"],
  "pt-BR": ["Banco e casa de leilões", "Estalagem", "Guilda dos artesãos", "Autoridade portuária", "Salão central", "Salão das armas"],
  "zh-Hans": ["银行与拍卖行", "旅店", "工匠公会", "港务局", "中央大厅", "武器大厅"],
  "zh-Hant": ["銀行與拍賣場", "旅店", "工匠公會", "港務局", "中央大廳", "武器大廳"]
};

for (const [language, gameLocale] of Object.entries(packs)) {
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const locale = JSON.parse(await readFile(path, "utf8"));
  const term = (key, original) => {
    const index = sourceIndices.get(key);
    if (index === undefined || source.values[index] !== original || !pack.values[index]) {
      throw new Error(`${language}: client term missing: ${key}/${original}`);
    }
    return pack.values[index];
  };
  const className = (name) => term(`ChrClasses:${classIds[name]}:0`, name);
  const professionName = (name) => term(`SkillLine:${skillIds[name]}:0`, name);
  const factionName = (name) => term(`Faction:${name === "Alliance" ? 469 : 67}:0`, name);
  locale.map.characters ??= {};
  locale.map.characters.classNames = Object.fromEntries(Object.entries(english.map.characters.classNames)
    .map(([id, name]) => [id, className(name)]));
  locale.map.characters.raceNames = Object.fromEntries(Object.entries(english.map.characters.raceNames)
    .map(([id, name]) => {
      const value = term(raceKeys[id], id === "skyborne" ? "skyborne" : name);
      return [id, id === "skyborne" ? value.replace(/^./u, (letter) => letter.toLocaleUpperCase(language)) : value];
    }));
  const [bankAuction, inn, guild, portAuthority, centralHall, hallOfArms] = signRoles[language];
  locale.map.zephrasSigns = {
    "bank-and-auction-house": bankAuction,
    "leather-work": professionName("Leatherworking"),
    herbalist: professionName("Herbalism"),
    tailoring: professionName("Tailoring"),
    inn,
    "cooking-trainer": `${professionName("Cooking")} · ${words[language].trainer}`,
    "crafters-guild": guild,
    "valanaar-port-authority": `Valanaar · ${portAuthority}`,
    "valanaar-central-hall": `Valanaar · ${centralHall}`,
    "hall-of-arms": hallOfArms,
    "swiftdrought-alchemy": `Swiftdrought · ${professionName("Alchemy")}`,
    "fairweather-fishing": `Fairweather · ${professionName("Fishing")}`,
    "calmbreeze-inn": `Calmbreeze · ${inn}`
  };
  const word = words[language];
  const special = (name) => word.special[specialNames.indexOf(name)];
  const classTitle = (name) => {
    if (specialNames.includes(name)) return special(name);
    const match = /^(\w+) Trainer$/.exec(name);
    if (!match || !classIds[match[1]]) throw new Error(`Unknown class trainer title: ${name}`);
    const role = className(match[1]);
    if (language === "de") return `${role}lehrer`;
    if (language === "ko") return `${role} 훈련사`;
    if (language.startsWith("zh")) return `${role}${word.trainer}`;
    return `${word.trainer} · ${role}`;
  };
  const professionTitle = (name) => {
    if (name === "Weapon Master") return special(name);
    if (name === "Wolf Riding Instructor") return `${term("SkillLine:149:0", "Wolf Riding")} · ${word.trainer}`;
    if (name === "Master Gnome Engineer") return `${term("SpellName:20220:0", "Gnomish Engineering")} · ${word.ranks[4]}`;
    if (name === "Master Shadoweave Tailor") return `${professionName("Tailoring")} · ${shadoweaveNames[language]} · ${word.ranks[4]}`;
    let remaining = name;
    let rank = "";
    for (const candidate of rankNames) if (remaining.startsWith(candidate + " ")) {
      rank = word.ranks[rankNames.indexOf(candidate)];
      remaining = remaining.slice(candidate.length + 1);
      break;
    }
    const trainer = remaining.endsWith(" Trainer");
    if (trainer) remaining = remaining.slice(0, -" Trainer".length);
    const profession = occupationSkills[remaining] ?? (skillIds[remaining] ? remaining : undefined);
    if (!profession) throw new Error(`Unknown profession trainer title: ${name}`);
    const role = trainer && rank
      ? language === "ko" || language.startsWith("zh") ? `${rank} ${word.trainer}` : `${word.trainer} (${rank})`
      : [rank, trainer ? word.trainer : ""].filter(Boolean).join(" · ");
    return [professionName(profession), role].filter(Boolean).join(" · ");
  };
  locale.map.professionTrainerTypes = Object.fromEntries(
    Object.entries(english.map.professionTrainerTypes).map(([id, name]) => [id, professionTitle(name)]));
  const otherTrainers = { de: "Andere Ausbilder", es: "Otros instructores", "es-MX": "Otros instructores",
    fr: "Autres formateurs", ko: "기타 훈련사", "pt-BR": "Outros instrutores",
    "zh-Hans": "其他训练师", "zh-Hant": "其他訓練師" }[language];
  locale.map.trainerFilters ??= {};
  locale.map.trainerFilters["class-trainer"] ??= {};
  locale.map.trainerFilters["class-trainer"].paladin = className("Paladin");
  locale.map.trainerFilters["class-trainer"].other = otherTrainers;
  locale.map.trainerFilters["profession-trainer"] ??= {};
  locale.map.trainerFilters["profession-trainer"]["weapon-master"] = special("Weapon Master");
  locale.map.trainerFilters["profession-trainer"].other = otherTrainers;
  locale.map.affiliations = {
    alliance: factionName("Alliance"), horde: factionName("Horde"),
    both: `${factionName("Alliance")} & ${factionName("Horde")}`
  };
  locale.map.classTrainers ??= {};
  locale.map.professionTrainers ??= {};
  for (const [id, record] of Object.entries(english.map.classTrainers)) {
    const translated = locale.map.classTrainers[id] ??= {};
    if (record.title) translated.title = classTitle(record.title);
    if (record.class === "Weapon Master") translated.class = special("Weapon Master");
    else if (record.class && classIds[record.class]) translated.class = className(record.class);
  }
  for (const [id, record] of Object.entries(english.map.professionTrainers)) {
    const translated = locale.map.professionTrainers[id] ??= {};
    if (record.title) translated.title = professionTitle(record.title);
    if (record.role) {
      const match = /^(.*) · (Alliance|Horde)$/.exec(record.role);
      translated.role = match ? `${professionTitle(match[1])} · ${factionName(match[2])}` : professionTitle(record.role);
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: trainer titles are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${Object.keys(english.map.classTrainers).length + Object.keys(english.map.professionTrainers).length} trainer records`);
}
