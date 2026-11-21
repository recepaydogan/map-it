/** Assemble reviewed guide sections without publishing incomplete translations. */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { localizeGuideGameLinks } from "./lib/localize-guide-game-links.mjs";
import { localizeFirstDungeonTable } from "./lib/localize-first-dungeon-table.mjs";
import { localizeFirstDungeonCrowdControlTable } from "./lib/localize-first-dungeon-crowd-control-table.mjs";
import { localizeGettingStartedClassTable } from "./lib/localize-getting-started-class-table.mjs";
import { localizeGettingStartedClassList } from "./lib/localize-getting-started-class-list.mjs";
import { localizeGettingStartedRaceTable, localizeGettingStartedRacialLists,
  localizeGettingStartedPriestTable } from "./lib/localize-getting-started-race-content.mjs";
import { localizeMakingMoneyAuctionTable } from "./lib/localize-making-money-auction-table.mjs";
import { localizeMakingMoneyGoodsTables } from "./lib/localize-making-money-goods-tables.mjs";
import { localizeLevelingStartingTable } from "./lib/localize-leveling-starting-table.mjs";
import { localizeLevelingClassTable } from "./lib/localize-leveling-class-table.mjs";
import { localizeLevelingRouteTable } from "./lib/localize-leveling-route-table.mjs";
import { localizeLevelingDungeonTable } from "./lib/localize-leveling-dungeon-table.mjs";
import { localizeWarriorStanceCheatsheet } from "./lib/localize-warrior-stance-cheatsheet.mjs";
import { localizeWarriorDungeonRoute } from "./lib/localize-warrior-dungeon-route.mjs";
import { localizeWarriorRacialTable, localizeWarriorRaceList } from "./lib/localize-warrior-racial-table.mjs";
import { localizeWarriorAbilityTable, localizeWarriorAbilityNotesLinks,
  localizeGuideSectionLinks, localizeGuideSectionLinksOutsideTables } from "./lib/localize-warrior-ability-table.mjs";
import { localizeWarriorTalentTables } from "./lib/localize-warrior-talent-tables.mjs";
import { localizeWarriorQuestTables } from "./lib/localize-warrior-quest-tables.mjs";
import { localizePaladinRacialTable } from "./lib/localize-paladin-racial-table.mjs";
import { localizePaladinQuestTables } from "./lib/localize-paladin-quest-tables.mjs";
import { localizePaladinTalentTable } from "./lib/localize-paladin-talent-table.mjs";
import { localizePaladinAbilityTable } from "./lib/localize-paladin-ability-table.mjs";
import { localizeRogueEnergyTable } from "./lib/localize-rogue-energy-table.mjs";
import { localizeRogueTalentTables } from "./lib/localize-rogue-talent-tables.mjs";
import { localizeRogueRacialTable } from "./lib/localize-rogue-racial-table.mjs";
import { localizeRogueAbilityTable } from "./lib/localize-rogue-ability-table.mjs";
import { localizeRogueQuestTable } from "./lib/localize-rogue-quest-table.mjs";
import { localizeWarlockAbilityTable } from "./lib/localize-warlock-ability-table.mjs";
import { localizeWarlockTalentTables } from "./lib/localize-warlock-talent-tables.mjs";
import { localizeShamanAbilityTable } from "./lib/localize-shaman-ability-table.mjs";
import { localizeShamanTalentTables } from "./lib/localize-shaman-talent-tables.mjs";
import { localizeShamanTotemTable } from "./lib/localize-shaman-totem-table.mjs";
import { localizeMageRacialTable } from "./lib/localize-mage-racial-table.mjs";
import { localizeMageTalentTables } from "./lib/localize-mage-talent-tables.mjs";
import { localizeMageQuestTable } from "./lib/localize-mage-quest-table.mjs";
import { localizeMageAbilityTable } from "./lib/localize-mage-ability-table.mjs";
import { localizeHunterRacialTable } from "./lib/localize-hunter-racial-table.mjs";
import { localizeHunterDungeonTable } from "./lib/localize-hunter-dungeon-table.mjs";
import { localizeHunterTalentTables } from "./lib/localize-hunter-talent-tables.mjs";
import { localizeHunterPetTable } from "./lib/localize-hunter-pet-table.mjs";
import { localizeHunterAbilityTable } from "./lib/localize-hunter-ability-table.mjs";
import { localizePriestRacialTable } from "./lib/localize-priest-racial-table.mjs";
import { localizePriestQuestTable } from "./lib/localize-priest-quest-table.mjs";
import { localizePriestTalentTables } from "./lib/localize-priest-talent-tables.mjs";
import { localizePriestAbilityTable } from "./lib/localize-priest-ability-table.mjs";
import { localizeDruidFormsTable } from "./lib/localize-druid-forms-table.mjs";
import { localizeDruidRacialTable } from "./lib/localize-druid-racial-table.mjs";
import { localizeDruidQuestTable } from "./lib/localize-druid-quest-table.mjs";
import { localizeDruidTalentTables } from "./lib/localize-druid-talent-tables.mjs";
import { localizeDruidAbilityTable } from "./lib/localize-druid-ability-table.mjs";
import { localizeProfessionsPairTable } from "./lib/localize-professions-pair-table.mjs";
import { localizeProfessionsRankTables } from "./lib/localize-professions-rank-tables.mjs";
import { localizeProfessionsSkillColorsTable } from "./lib/localize-professions-skill-colors-table.mjs";
import { localizeProfessionsCampingTable } from "./lib/localize-professions-camping-table.mjs";
import { localizeProfessionsGatheringTable } from "./lib/localize-professions-gathering-table.mjs";
import { localizeProfessionsGatheringTrainers,
  localizeProfessionsTrainerLists } from "./lib/localize-professions-gathering-trainers.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const index = JSON.parse(await readFile(join(root, "public/data/guides/index.json"), "utf8"));
const requestedGuide = process.argv.includes("--guide")
  ? process.argv[process.argv.indexOf("--guide") + 1] : undefined;
if (requestedGuide && !index.guides.some((guide) => guide.id === requestedGuide)) {
  throw new Error(`Unknown guide: ${requestedGuide}`);
}
const source = JSON.parse(await readFile(join(root, "public/data/locales/wow-forever/source.json"), "utf8"));
const entitySource = JSON.parse(await readFile(join(root,
  "public/data/locales/wow-forever/map-entity-source.json"), "utf8"));
const priestNpcCatalogs = await Promise.all([
  "pfquest-classic-names", "polestar-forever-names", "reviewed-priest-guide-names",
].map(async (name) => JSON.parse(await readFile(join(root,
  `data/npc-name-localization/${name}.json`), "utf8"))));
const gameLocaleCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const firstDungeonTableLabels = JSON.parse(await readFile(join(root, "data/guide-localization/first-dungeon-table.json"), "utf8"));
const crowdControlTableLabels = JSON.parse(await readFile(join(root, "data/guide-localization/first-dungeon-crowd-control-table.json"), "utf8"));
const gettingStartedClassTableLabels = JSON.parse(await readFile(join(root, "data/guide-localization/getting-started-class-table.json"), "utf8"));
const gettingStartedClassDescriptions = JSON.parse(await readFile(join(root, "data/guide-localization/getting-started-class-descriptions.json"), "utf8"));
const gettingStartedRaceData = JSON.parse(await readFile(join(root, "data/guide-localization/getting-started-race-data.json"), "utf8"));
const makingMoneyAuctionLabels = JSON.parse(await readFile(join(root, "data/guide-localization/making-money-auction-table.json"), "utf8"));
const makingMoneyGoodsLabels = JSON.parse(await readFile(join(root, "data/guide-localization/making-money-goods-tables.json"), "utf8"));
const levelingStartingLabels = JSON.parse(await readFile(join(root, "data/guide-localization/leveling-starting-table.json"), "utf8"));
const levelingClassLabels = JSON.parse(await readFile(join(root, "data/guide-localization/leveling-class-table.json"), "utf8"));
const levelingRouteLabels = JSON.parse(await readFile(join(root, "data/guide-localization/leveling-route-table.json"), "utf8"));
const levelingDungeonLabels = JSON.parse(await readFile(join(root, "data/guide-localization/leveling-dungeon-table.json"), "utf8"));
const warriorStanceLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-stance-cheatsheet.json"), "utf8"));
const warriorDungeonRoutes = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-dungeon-route.json"), "utf8"));
const warriorRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-racial-table.json"), "utf8"));
const warriorAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-ability-table.json"), "utf8"));
const warriorTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-talent-tables.json"), "utf8"));
const warriorQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-quest-tables.json"), "utf8"));
const paladinRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/paladin-racial-table.json"), "utf8"));
const paladinQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/paladin-quest-tables.json"), "utf8"));
const paladinQuestNames = JSON.parse(await readFile(join(root, "data/guide-localization/paladin-quest-names.json"), "utf8"));
const shamanQuestNames = JSON.parse(await readFile(join(root, "data/guide-localization/shaman-quest-names.json"), "utf8"));
const guideQuestCrossrefs = JSON.parse(await readFile(join(root, "data/quest-title-localization/reviewed-guide-crossrefs.json"), "utf8"));
const guideQuestSeries = JSON.parse(await readFile(join(root, "data/quest-title-localization/reviewed-guide-series.json"), "utf8"));
const reviewedNpcNames = JSON.parse(await readFile(join(root, "data/npc-name-localization/reviewed-client-evidence.json"), "utf8"));
const rogueQuestQualifiers = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-quest-qualifiers.json"), "utf8"));
const warriorQuestGiverOptions = JSON.parse(await readFile(join(root, "data/guide-localization/warrior-quest-giver-options.json"), "utf8"));
const paladinTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/paladin-talent-table.json"), "utf8"));
const paladinAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/paladin-ability-table.json"), "utf8"));
const rogueEnergyLabels = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-energy-table.json"), "utf8"));
const rogueTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-talent-tables.json"), "utf8"));
const rogueRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-racial-table.json"), "utf8"));
const rogueAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-ability-table.json"), "utf8"));
const rogueQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/rogue-quest-table.json"), "utf8"));
const warlockAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warlock-ability-table.json"), "utf8"));
const warlockTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/warlock-talent-tables.json"), "utf8"));
const shamanAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/shaman-ability-table.json"), "utf8"));
const shamanTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/shaman-talent-tables.json"), "utf8"));
const shamanTotemLabels = JSON.parse(await readFile(join(root, "data/guide-localization/shaman-totem-table.json"), "utf8"));
const mageRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/mage-racial-table.json"), "utf8"));
const mageTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/mage-talent-tables.json"), "utf8"));
const mageQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/mage-quest-table.json"), "utf8"));
const mageQuestTitles = JSON.parse(await readFile(join(root,
  "data/quest-title-localization/polestar-forever-titles.json"), "utf8")).titles;
const mageAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/mage-ability-table.json"), "utf8"));
const hunterRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/hunter-racial-table.json"), "utf8"));
const hunterDungeonLabels = JSON.parse(await readFile(join(root, "data/guide-localization/hunter-dungeon-table.json"), "utf8"));
const hunterTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/hunter-talent-tables.json"), "utf8"));
const hunterPetLabels = JSON.parse(await readFile(join(root, "data/guide-localization/hunter-pet-table.json"), "utf8"));
const hunterAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/hunter-ability-table.json"), "utf8"));
const priestRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/priest-racial-table.json"), "utf8"));
const priestQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/priest-quest-table.json"), "utf8"));
const priestTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/priest-talent-tables.json"), "utf8"));
const druidFormsLabels = JSON.parse(await readFile(join(root, "data/guide-localization/druid-forms-table.json"), "utf8"));
const druidRacialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/druid-racial-table.json"), "utf8"));
const druidQuestLabels = JSON.parse(await readFile(join(root, "data/guide-localization/druid-quest-table.json"), "utf8"));
const druidQuestNames = JSON.parse(await readFile(join(root, "data/guide-localization/druid-quest-names.json"), "utf8"));
const druidTalentLabels = JSON.parse(await readFile(join(root, "data/guide-localization/druid-talent-tables.json"), "utf8"));
const druidAbilityLabels = JSON.parse(await readFile(join(root, "data/guide-localization/druid-ability-table.json"), "utf8"));
const professionsPairLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-pair-table.json"), "utf8"));
const professionsRankLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-rank-tables.json"), "utf8"));
const professionsSkillColorsLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-skill-colors-table.json"), "utf8"));
const professionsCampingLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-camping-table.json"), "utf8"));
const professionsGatheringLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-gathering-table.json"), "utf8"));
const professionsGatheringTrainerLabels = JSON.parse(await readFile(join(root, "data/guide-localization/professions-gathering-trainers.json"), "utf8"));
const exists = async (path) => Boolean(await stat(path).catch(() => null));
const headings = (html) => [...html.matchAll(/<(h[23]) id="([^"]+)">([^<]+)<\/h[23]>/g)]
  .map(([, tag, id, title]) => ({ id, title, depth: Number(tag[1]) }));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map((match) => match[1]);
const tableRowCounts = (html) => [...html.matchAll(/<table>[\s\S]*?<\/table>/g)]
  .map(([table]) => [...table.matchAll(/<tr(?:>|\s)/g)].length);
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const replaceVisibleTerm = (html, english, localized) => html
  .split(/(\{\{CLIENT:[^}]+\}\})/g)
  .map((part, index) => index % 2 ? part : part.replaceAll(english, escapeHtml(localized)))
  .join("");
const replaceTextTerm = (html, english, localized) => html
  .split(/(<[^>]+>|\{\{CLIENT:[^}]+\}\})/g)
  .map((part) => part.startsWith("<") || part.startsWith("{{CLIENT:")
    ? part : part.replaceAll(english, escapeHtml(localized)))
  .join("");
const shamanClientQuestKeys = {
  "Rune-Inscribed Parchment": "ItemSparse:9568:4",
  "Rune-Inscribed Tablet": "ItemSparse:9562:4",
  "Rune-Inscribed Note": "ItemSparse:9552:4",
  "Call of Water": "SpellName:1277346:0",
};
const druidClientQuestKeys = {
  Moonglade: "AreaTable:493:1",
  "Aquatic Form": "SpellName:1066:0",
};

let built = 0;
let pending = 0;
for (const language of languages) {
  const summary = JSON.parse(await readFile(join(root, `public/data/guides/locales/${language}/index.json`), "utf8"));
  const gameLocale = JSON.parse(await readFile(join(root, `public/data/locales/wow-forever/${gameLocaleCodes[language]}.json`), "utf8"));
  const entityLocale = JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/map-entity-${gameLocaleCodes[language]}.json`), "utf8"));
  for (const guide of index.guides) {
    if (requestedGuide && guide.id !== requestedGuide) continue;
    const original = JSON.parse(await readFile(join(root, `public/data/guides/${guide.id}.json`), "utf8"));
    const sections = original.html.split(/(?=<h2 id=)/);
    const ids = ["opening", ...sections.slice(1).map((section) => section.match(/^<h2 id="([^"]+)"/)?.[1])];
    if (ids.some((id) => !id)) throw new Error(`${guide.id}: invalid source section`);
    const directory = join(root, "data/guide-localization", language, guide.id);
    const files = ids.map((id) => join(directory, `${id}.html`));
    const available = await Promise.all(files.map(exists));
    if (!available.some(Boolean)) continue;
    const localizedSections = await Promise.all(files.map((file, position) =>
      available[position] ? readFile(file, "utf8") : Promise.resolve(null)));
    const preparedSections = localizedSections.map((section, position) => {
      if (section === null) return null;
      if (guide.id === "first-dungeon" && ids[position] === "dungeons-you-can-run-now") {
        section = section.replace("{{DUNGEON_TABLE}}",
          localizeFirstDungeonTable(sections[position], firstDungeonTableLabels[language], source, gameLocale));
      }
      if (guide.id === "first-dungeon" && ids[position] === "how-a-pull-works") {
        section = section.replace("{{CROWD_CONTROL_TABLE}}",
          localizeFirstDungeonCrowdControlTable(sections[position], crowdControlTableLabels[language], source, gameLocale));
      }
      if (guide.id === "getting-started" && ids[position] === "choose-a-class") {
        section = section.replace("{{CLASS_TABLE}}",
          localizeGettingStartedClassTable(sections[position], gettingStartedClassTableLabels[language],
            source, gameLocale, language));
        section = section.replace("{{CLASS_LIST}}",
          localizeGettingStartedClassList(sections[position], gettingStartedClassDescriptions[language]));
      }
      if (guide.id === "getting-started" && ids[position] === "choose-a-faction-and-race") {
        const raceData = gettingStartedRaceData[language] ??
          (language === "es-MX" ? gettingStartedRaceData.es : null);
        section = section.replace("{{RACE_TABLE}}",
          localizeGettingStartedRaceTable(sections[position], raceData?.labels, source, gameLocale, language));
        const racialLists = localizeGettingStartedRacialLists(sections[position], raceData?.racials,
          source, gameLocale);
        section = section.replace("{{ALLIANCE_RACIALS}}", racialLists[0])
          .replace("{{HORDE_RACIALS}}", racialLists[1])
          .replace("{{PRIEST_TABLE}}", localizeGettingStartedPriestTable(sections[position],
            raceData?.labels, raceData?.priest, source, gameLocale));
      }
      if (guide.id === "making-money" && ids[position] === "where-the-auction-houses-are") {
        section = section.replace("{{AUCTION_TABLE}}",
          localizeMakingMoneyAuctionTable(sections[position], makingMoneyAuctionLabels[language],
            source, gameLocale, language));
      }
      if (guide.id === "making-money" && ids[position] === "what-sells-at-levels-1-20") {
        const tables = localizeMakingMoneyGoodsTables(sections[position],
          makingMoneyGoodsLabels[language] ?? (language === "es-MX" ? makingMoneyGoodsLabels.es : null),
          source, gameLocale, language);
        tables.forEach((table, index) => {
          section = section.replace(`{{GOODS_TABLE_${index}}}`, table);
        });
      }
      if (guide.id === "leveling" && ids[position] === "where-each-race-starts") {
        section = section.replace("{{STARTING_TABLE}}",
          localizeLevelingStartingTable(sections[position], levelingStartingLabels[language],
            source, gameLocale, language));
      }
      if (guide.id === "leveling" && ids[position] === "class-leveling-guides") {
        section = section.replace("{{CLASS_LEVELING_TABLE}}",
          localizeLevelingClassTable(sections[position], levelingClassLabels[language], source, gameLocale));
      }
      if (guide.id === "leveling" && ["alliance-route", "horde-route"].includes(ids[position])) {
        section = section.replace("{{ROUTE_TABLE}}",
          localizeLevelingRouteTable(sections[position], levelingRouteLabels[language],
            source, gameLocale, language, ids[position] === "alliance-route" ? "alliance" : "horde"));
      }
      if (guide.id === "leveling" && ids[position] === "dungeons-on-the-way") {
        section = section.replace("{{DUNGEON_TABLE}}",
          localizeLevelingDungeonTable(sections[position], levelingDungeonLabels[language],
            source, gameLocale));
      }
      if (guide.id === "leveling-warrior" && ids[position] === "rage-and-stances") {
        section = section.replace("{{STANCE_CHEATSHEET}}",
          localizeWarriorStanceCheatsheet(sections[position], warriorStanceLabels[language],
            source, gameLocale));
      }
      if (guide.id === "leveling-warrior" && ids[position] === "groups-and-dungeons") {
        section = section.replace("{{DUNGEON_ROUTE}}",
          localizeWarriorDungeonRoute(sections[position], warriorDungeonRoutes[language],
            source, gameLocale));
      }
      if (guide.id === "leveling-warrior" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizeWarriorRacialTable(sections[position], warriorRacialLabels[language],
            source, gameLocale));
        for (const faction of ["alliance", "horde"]) {
          section = section.replace(`{{${faction.toUpperCase()}_RACES}}`,
            localizeWarriorRaceList(sections[position], source, gameLocale, language, faction));
        }
      }
      if (guide.id === "leveling-warrior" && ids[position] === "abilities-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeWarriorAbilityTable(sections[position], warriorAbilityLabels[language]));
        section = localizeWarriorAbilityNotesLinks(sections[position], section);
      } else if (guide.id === "leveling-warrior" && ids[position] === "talents-which-spec-to-level-with") {
        const tables = localizeWarriorTalentTables(sections[position], warriorTalentLabels[language]);
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-warrior" && ids[position] === "class-quests") {
        const tables = localizeWarriorQuestTables(sections[position], warriorQuestLabels[language]);
        section = section.replace("{{QUEST_TABLE_10}}", tables[0])
          .replace("{{QUEST_TABLE_20_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-paladin" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizePaladinRacialTable(sections[position], paladinRacialLabels[language],
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-paladin" && ids[position] === "class-quests") {
        const tables = localizePaladinQuestTables(sections[position],
          paladinQuestLabels[language], paladinQuestNames[language]);
        section = section.replace("{{QUEST_TABLE_12}}", tables[0])
          .replace("{{QUEST_TABLE_20}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-paladin" && ids[position] === "talents-which-spec-to-level-with") {
        section = section.replace("{{TALENT_TABLE}}",
          localizePaladinTalentTable(sections[position], paladinTalentLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-paladin" && ids[position] === "abilities-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizePaladinAbilityTable(sections[position], paladinAbilityLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-rogue" && ids[position] === "how-a-rogue-fights") {
        section = section.replace("{{ENERGY_TABLE}}",
          localizeRogueEnergyTable(sections[position], rogueEnergyLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-rogue" && ids[position] === "talents-which-spec-to-level-with") {
        const tables = localizeRogueTalentTables(sections[position], rogueTalentLabels[language]);
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-rogue" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizeRogueRacialTable(sections[position],
            rogueRacialLabels[language] ?? (language === "es-MX" ? rogueRacialLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-rogue" && ids[position] === "your-abilities-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeRogueAbilityTable(sections[position], rogueAbilityLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-rogue" && ids[position] === "class-quests-up-to-30") {
        section = section.replace("{{QUEST_TABLE}}",
          localizeRogueQuestTable(sections[position], rogueQuestLabels[language], source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-warlock" && ids[position] === "your-spells-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeWarlockAbilityTable(sections[position], warlockAbilityLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-warlock" && ids[position] === "talents-which-spec-to-level") {
        const tables = localizeWarlockTalentTables(sections[position],
          warlockTalentLabels[language], source, gameLocale);
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-shaman" && ids[position] === "your-abilities-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeShamanAbilityTable(sections[position], shamanAbilityLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-shaman" && ids[position] === "talents-which-spec-to-level-with") {
        const tables = localizeShamanTalentTables(sections[position], shamanTalentLabels[language]);
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-shaman" && ids[position] === "totems-shocks-and-weapon-imbues") {
        section = section.replace("{{TOTEM_TABLE}}",
          localizeShamanTotemTable(sections[position], shamanTotemLabels[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-hunter" && ids[position] === "abilities-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeHunterAbilityTable(sections[position],
            hunterAbilityLabels[language] ?? (language === "es-MX" ? hunterAbilityLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-hunter" && ids[position] === "your-pet-taming-feeding-and-families") {
        section = section.replace("{{PET_TABLE}}",
          localizeHunterPetTable(sections[position],
            hunterPetLabels[language] ?? (language === "es-MX" ? hunterPetLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-hunter" && ids[position] === "talents-which-spec-to-level-with") {
        const tables = localizeHunterTalentTables(sections[position],
          hunterTalentLabels[language] ?? (language === "es-MX" ? hunterTalentLabels.es : null));
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-hunter" && ids[position] === "groups-and-dungeons") {
        section = section.replace("{{DUNGEON_TABLE}}",
          localizeHunterDungeonTable(sections[position],
            hunterDungeonLabels[language] ?? (language === "es-MX" ? hunterDungeonLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-hunter" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizeHunterRacialTable(sections[position],
            hunterRacialLabels[language] ?? (language === "es-MX" ? hunterRacialLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-priest" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizePriestRacialTable(sections[position],
            priestRacialLabels[language] ?? (language === "es-MX" ? priestRacialLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-priest" && ids[position] === "class-quests-up-to-30") {
        section = section.replace("{{QUEST_TABLE}}",
          localizePriestQuestTable(sections[position],
            priestQuestLabels[language] ?? (language === "es-MX" ? priestQuestLabels.es : null),
            source, gameLocale, entitySource, entityLocale, language, priestNpcCatalogs));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-priest" && ids[position] === "talents-which-spec-to-level-with") {
        const tables = localizePriestTalentTables(sections[position],
          priestTalentLabels[language] ?? (language === "es-MX" ? priestTalentLabels.es : null));
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-priest" && ids[position] === "your-abilities-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizePriestAbilityTable(sections[position],
            hunterAbilityLabels[language] ?? (language === "es-MX" ? hunterAbilityLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "picking-your-two-professions") {
        section = section.replace("{{PAIR_TABLE}}",
          localizeProfessionsPairTable(sections[position],
            professionsPairLabels[language] ?? (language === "es-MX" ? professionsPairLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "ranks-and-how-far-you-can-go-by-level-30") {
        const tables = localizeProfessionsRankTables(sections[position],
          professionsRankLabels[language] ?? (language === "es-MX" ? professionsRankLabels.es : null));
        section = section.replace("{{RANK_TABLE}}", tables[0])
          .replace("{{TRAINER_LEVEL_TABLE}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "how-skill-ups-and-recipe-colors-work") {
        section = section.replace("{{SKILL_COLOR_TABLE}}",
          localizeProfessionsSkillColorsTable(sections[position],
            professionsSkillColorsLabels[language] ??
              (language === "es-MX" ? professionsSkillColorsLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "camping-what-each-profession-adds") {
        section = section.replace("{{CAMPING_TABLE}}",
          localizeProfessionsCampingTable(sections[position],
            professionsCampingLabels[language] ??
              (language === "es-MX" ? professionsCampingLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "gathering-herbalism-mining-and-skinning") {
        section = section.replace("{{GATHERING_TABLE}}",
          localizeProfessionsGatheringTable(sections[position],
            professionsGatheringLabels[language] ??
              (language === "es-MX" ? professionsGatheringLabels.es : null), source, gameLocale));
        const trainerLists = localizeProfessionsGatheringTrainers(sections[position],
          professionsGatheringTrainerLabels[language] ??
            (language === "es-MX" ? professionsGatheringTrainerLabels.es : null), source, gameLocale);
        trainerLists.forEach((list, index) => {
          section = section.replace(`{{TRAINERS_${index}}}`, list);
        });
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "secondary-skills-cooking-first-aid-and-fishing") {
        const trainerLabels = professionsGatheringTrainerLabels[language] ??
          (language === "es-MX" ? professionsGatheringTrainerLabels.es : null);
        const trainerLists = localizeProfessionsTrainerLists(sections[position],
          { alliance: trainerLabels.alliance, horde: trainerLabels.horde }, source, gameLocale);
        trainerLists.forEach((list, index) => {
          section = section.replace(`{{TRAINERS_${index}}}`, list);
        });
        section = localizeGuideSectionLinks(sections[position], section);
      } else if (guide.id === "professions" && ids[position] === "crafting-the-six-crafting-professions") {
        const trainerLabels = professionsGatheringTrainerLabels[language] ??
          (language === "es-MX" ? professionsGatheringTrainerLabels.es : null);
        const trainerLists = localizeProfessionsTrainerLists(sections[position],
          { alliance: trainerLabels.alliance, horde: trainerLabels.horde }, source, gameLocale, 6);
        trainerLists.forEach((list, index) => {
          section = section.replace(`{{TRAINERS_${index}}}`, list);
        });
        section = localizeGuideSectionLinks(sections[position], section);
      } else if (guide.id === "leveling-druid" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizeDruidRacialTable(sections[position],
            druidRacialLabels[language] ?? (language === "es-MX" ? druidRacialLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-druid" && ids[position] === "class-quests-up-to-30") {
        section = section.replace("{{QUEST_TABLE}}",
          localizeDruidQuestTable(sections[position],
            druidQuestLabels[language] ?? (language === "es-MX" ? druidQuestLabels.es : null),
            source, gameLocale, druidQuestNames[language]));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-druid" && ids[position] === "talents-which-spec-to-level") {
        const tables = localizeDruidTalentTables(sections[position],
          druidTalentLabels[language] ?? (language === "es-MX" ? druidTalentLabels.es : null));
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-druid" && ids[position] === "your-spells-and-forms-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeDruidAbilityTable(sections[position],
            hunterAbilityLabels[language] ?? (language === "es-MX" ? hunterAbilityLabels.es : null),
            druidAbilityLabels[language] ?? (language === "es-MX" ? druidAbilityLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-druid" && ids[position] === "forms-and-shapeshifting") {
        section = section.replace("{{FORMS_TABLE}}",
          localizeDruidFormsTable(sections[position],
            druidFormsLabels[language] ?? (language === "es-MX" ? druidFormsLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-mage" && ids[position] === "choosing-a-race") {
        section = section.replace("{{RACIAL_TABLE}}",
          localizeMageRacialTable(sections[position],
            mageRacialLabels[language] ?? (language === "es-MX" ? mageRacialLabels.es : null),
            source, gameLocale));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-mage" && ids[position] === "talents-which-spec-to-level") {
        const tables = localizeMageTalentTables(sections[position],
          mageTalentLabels[language] ?? (language === "es-MX" ? mageTalentLabels.es : null));
        section = section.replace("{{TALENT_TABLE_20}}", tables[0])
          .replace("{{TALENT_TABLE_30}}", tables[1]);
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-mage" && ids[position] === "class-quests-up-to-30") {
        section = section.replace("{{QUEST_TABLE}}",
          localizeMageQuestTable(sections[position],
            mageQuestLabels[language] ?? (language === "es-MX" ? mageQuestLabels.es : null),
            source, gameLocale, language, mageQuestTitles));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (guide.id === "leveling-mage" && ids[position] === "your-spells-level-by-level") {
        section = section.replace("{{ABILITY_TABLE}}",
          localizeMageAbilityTable(sections[position],
            mageAbilityLabels[language] ?? (language === "es-MX" ? mageAbilityLabels.es : null)));
        section = localizeGuideSectionLinksOutsideTables(sections[position], section);
      } else if (section.includes("{{LINK:")) {
        section = localizeGuideSectionLinks(sections[position], section);
      }
      if (guide.id === "leveling-paladin") {
        for (const [english, localized] of Object.entries(paladinQuestNames[language])) {
          section = replaceVisibleTerm(section, english, localized);
        }
      }
      if (guide.id === "leveling-warrior") {
        section = replaceVisibleTerm(section,
          "Grimand Elmore, Klockmort Spannerspan or Mathiel", warriorQuestGiverOptions[language]);
      }
      if (guide.id === "leveling-druid") {
        for (const [english, localized] of Object.entries(druidQuestNames[language].names)) {
          section = replaceVisibleTerm(section, english, localized);
        }
        for (const [english, key] of Object.entries(druidClientQuestKeys)) {
          const index = sourceIndices.get(key);
          if (index === undefined || source.values[index] !== english || !gameLocale.values[index]) {
            throw new Error(`${language}/${guide.id}: unavailable client quest term ${key}`);
          }
          section = replaceVisibleTerm(section, english, gameLocale.values[index]);
        }
      }
      if (guide.id === "leveling-shaman") {
        for (const [english, localized] of Object.entries(shamanQuestNames[language])) {
          section = replaceVisibleTerm(section, english, localized);
        }
        for (const [english, key] of Object.entries(shamanClientQuestKeys)) {
          const index = sourceIndices.get(key);
          if (index === undefined || source.values[index] !== english || !gameLocale.values[index]) {
            throw new Error(`${language}/${guide.id}: unavailable client quest term ${key}`);
          }
          section = replaceVisibleTerm(section, english, gameLocale.values[index]);
        }
      }
      if (guide.id === "leveling-rogue" || guide.id === "leveling-priest") {
        for (const record of Object.values(guideQuestCrossrefs)) {
          section = replaceVisibleTerm(section, record.en, record[language]);
        }
        if (guide.id === "leveling-rogue") {
          section = replaceVisibleTerm(section, "(the second part)", rogueQuestQualifiers[language]);
        }
      }
      if (["getting-started", "leveling-hunter", "leveling-warlock", "leveling-paladin",
        "leveling-warrior"].includes(guide.id)) {
        for (const record of Object.values(guideQuestSeries)) {
          section = replaceVisibleTerm(section, record.en, record[language]);
        }
      }
      for (const [englishName, record] of Object.entries(reviewedNpcNames)) {
        if (!section.includes(englishName)) continue;
        const index = sourceIndices.get(record.sourceKey);
        const localized = record[language];
        const anchor = record.clientAnchors?.[language] ?? localized;
        if (index === undefined || !source.values[index].includes(englishName) || !anchor ||
          !gameLocale.values[index]?.toLocaleLowerCase(language)
            .includes(anchor.toLocaleLowerCase(language))) {
          throw new Error(`${language}/${guide.id}: unavailable NPC name ${englishName}`);
        }
        section = replaceTextTerm(section, englishName, localized);
      }
      section = section.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)(?:\|([^}]+))?\}\}/g, (_, key, sourceLabel) => {
        const index = sourceIndices.get(key);
        const expected = sourceLabel ?? source.values[index];
        if (index === undefined || !expected || !source.values[index].includes(expected) ||
          !sections[position].includes(expected) ||
          !gameLocale.values[index]) {
          throw new Error(`${language}/${guide.id}: unavailable client term ${key}`);
        }
        return escapeHtml(gameLocale.values[index]);
      });
      if (position > 0 && !section.trimStart().startsWith(`<h2 id="${ids[position]}">`)) {
        throw new Error(`${language}/${guide.id}: ${ids[position]} heading is missing`);
      }
      const originalHeadings = headings(sections[position]).map(({ id, depth }) => ({ id, depth }));
      const translatedHeadings = headings(section).map(({ id, depth }) => ({ id, depth }));
      if (JSON.stringify(translatedHeadings) !== JSON.stringify(originalHeadings)) {
        throw new Error(`${language}/${guide.id}: ${ids[position]} heading IDs or depths changed`);
      }
      if (JSON.stringify(links(section)) !== JSON.stringify(links(sections[position]))) {
        throw new Error(`${language}/${guide.id}: ${ids[position]} guide links changed`);
      }
      if (JSON.stringify(tableRowCounts(section)) !== JSON.stringify(tableRowCounts(sections[position]))) {
        throw new Error(`${language}/${guide.id}: ${ids[position]} table rows changed`);
      }
      return localizeGuideGameLinks(sections[position], section, source, gameLocale);
    });
    if (available.some((value) => !value)) {
      pending += 1;
      console.log(`${language}/${guide.id}: ${available.filter(Boolean).length}/${ids.length} sections`);
      continue;
    }
    const html = preparedSections.join("").trim();
    const localizedHeadings = headings(html);
    if (JSON.stringify(localizedHeadings.map(({ id, depth }) => ({ id, depth }))) !==
      JSON.stringify(original.headings.map(({ id, depth }) => ({ id, depth })))) {
      throw new Error(`${language}/${guide.id}: heading IDs or depths changed`);
    }
    if (JSON.stringify(links(html)) !== JSON.stringify(links(original.html))) {
      throw new Error(`${language}/${guide.id}: guide links changed`);
    }
    const translated = summary.summaries[guide.id];
    if (!translated?.title || !translated.intro) throw new Error(`${language}/${guide.id}: summary is missing`);
    const result = { id: guide.id, group: guide.group, title: translated.title,
      intro: translated.intro, headings: localizedHeadings, html };
    const output = join(root, `public/data/guides/locales/${language}/${guide.id}.json`);
    await mkdir(join(root, `public/data/guides/locales/${language}`), { recursive: true });
    await writeFile(output, JSON.stringify(result) + "\n");
    built += 1;
    console.log(`Built ${language}/${guide.id}`);
  }
}
console.log(`Built ${built} complete guides; ${pending} guide translations are in progress.`);
