import { useAppLanguage } from "./app-language";
import { useGameText } from "./game-text";
import { specializationKey } from "./specialization-keys";

const CLASS_IDS: Record<string, number> = {
  warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5,
  shaman: 7, mage: 8, warlock: 9, druid: 11,
};
const RACE_IDS: Record<string, number> = {
  human: 1, orc: 2, dwarf: 3, nightelf: 4, undead: 5,
  tauren: 6, gnome: 7, troll: 8,
};
const PROFESSION_SKILL_IDS: Record<string, number> = {
  alchemy: 171, blacksmithing: 164, enchanting: 333, engineering: 202,
  herbalism: 182, leatherworking: 165, mining: 186, skinning: 393,
  tailoring: 197, cooking: 185, firstaid: 129, fishing: 356,
};

export function useGameNames() {
  const gameText = useGameText();
  const language = useAppLanguage();
  return {
    specializationName: (classId: string, english: string) => {
      const key = specializationKey(classId, english);
      return key ? gameText(english, key) : english;
    },
    className: (id: string, english: string) => {
      const clientId = CLASS_IDS[id];
      return clientId ? gameText(english, `ChrClasses:${clientId}:0`) : english;
    },
    raceName: (id: string, english: string) => {
      if (id === "skyborne") {
        const name = gameText(english, "ChrRaces:95:4");
        return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
      }
      const clientId = RACE_IDS[id];
      return clientId ? gameText(english, `ChrRaces:${clientId}:2`) : english;
    },
    professionName: (id: string, english: string) => {
      if (id === "camping") return gameText(english, "SpellName:1290211:0");
      const skillId = PROFESSION_SKILL_IDS[id];
      return skillId ? gameText(english, `SkillLine:${skillId}:0`) : english;
    },
  };
}
