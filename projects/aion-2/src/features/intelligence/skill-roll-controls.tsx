import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import type { SkillRollData } from "./intelligence-types";

const triggerClassName = "w-auto min-h-[38px] max-w-[min(240px,100%)]";
const menuClassName = "[&_[data-state=checked]]:bg-surface-hover";

export default function SkillRollControls({ data, characterClass, skill, onChange }: {
  data: SkillRollData; characterClass: string; skill: string; onChange: (characterClass: string, skill: string) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const rolls = Object.values(data.pools).flat();
  const classes = [...new Set(rolls.map(r => r.class))].sort();
  const availableRolls = characterClass ? rolls.filter(roll => roll.class === characterClass) : rolls;
  const skills = [...new Map(availableRolls.map(roll => [roll.skill.id, roll.skill])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <CategoryDropdown
        value={characterClass}
        ariaLabel={t("intel.skills.class")}
        triggerClassName={triggerClassName}
        contentClassName={menuClassName}
        options={[{ key: "", label: t("intel.skills.allClasses") }, ...classes.map(name => ({ key: name, label: gameText(name) }))]}
        onChange={nextClass => {
          const compatible = !nextClass || rolls.some(roll => roll.class === nextClass && roll.skill.id === skill);
          onChange(nextClass, compatible ? skill : "");
        }}
      />
      <CategoryDropdown
        value={skill}
        ariaLabel={t("intel.skills.skill")}
        triggerClassName={triggerClassName}
        contentClassName={menuClassName}
        options={[
          { key: "", label: t("intel.skills.allSkills") },
          ...skills.map(option => ({ key: option.id, label: gameText(option.name) })),
        ]}
        onChange={nextSkill => onChange(characterClass, nextSkill)}
      />
    </>
  );
}
