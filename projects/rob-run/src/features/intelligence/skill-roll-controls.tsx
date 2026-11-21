import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { SkillRollData } from "./intelligence-types";

export default function SkillRollControls({ data, characterClass, skill, onChange }: {
  data: SkillRollData; characterClass: string; skill: string; onChange: (characterClass: string, skill: string) => void;
}) {
  const { t } = useTranslation();
  const rolls = Object.values(data.pools).flat();
  const classes = [...new Set(rolls.map(r => r.class))].sort();
  const skills = [...new Map(rolls.filter(r => !characterClass || r.class === characterClass).map(r => [r.skill.id, r.skill])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return <details className="rounded-[var(--radius-md)] border border-border p-2.5" open={Boolean(characterClass || skill) || undefined}>
    <summary className="cursor-pointer text-xs text-zinc-200">{t("intel.skills.filter")}</summary>
    <div className="mt-2 space-y-2">
      <CategoryDropdown value={characterClass} ariaLabel={t("intel.skills.class")} options={[{ key: "", label: t("intel.skills.allClasses") }, ...classes.map(c => ({ key: c, label: c }))]} onChange={v => onChange(v, "")} />
      <CategoryDropdown value={skill} ariaLabel={t("intel.skills.skill")} options={[{ key: "", label: t("intel.skills.allSkills") }, ...skills.map(s => ({ key: s.id, label: s.name }))]} onChange={v => onChange(characterClass, v)} />
    </div>
  </details>;
}
