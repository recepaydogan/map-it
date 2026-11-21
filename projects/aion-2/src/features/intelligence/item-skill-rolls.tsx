import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { SkillRollData } from "./intelligence-types";
import { itemSkillRolls } from "./skill-rolls";

export default function ItemSkillRolls({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const state = useIntelligenceData<SkillRollData>("skill-rolls");
  const open = useReferenceNavigation();
  const [selected, setSelected] = useState("");
  if (state.status !== "ready") return state.status === "error" ? <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p> : null;
  const rolls = itemSkillRolls(state.data, itemId);
  if (!rolls.length) return null;
  const classes = [...new Set(rolls.map(r => r.class))].sort();
  const current = classes.includes(selected) ? selected : classes[0];
  return <section className="max-w-[760px] space-y-3">
    <DatabaseSectionTitle>{t("intel.skills.title")}</DatabaseSectionTitle>
    <CategoryDropdown value={current ?? ""} ariaLabel={t("intel.skills.class")} options={classes.map(c => ({ key: c, label: gameText(c) }))} onChange={setSelected} />
    <ProgressiveList initialCount={8} className="grid gap-2 @min-[440px]:grid-cols-2">{rolls.filter(r => r.class === current).map(r => <button key={r.skill.id} type="button" onClick={() => open(r.skill)}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-sm text-zinc-100 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">
      <span>{gameText(r.skill.name)}</span><span className="shrink-0 text-xs tabular-nums text-accent">{t(r.base === r.maximum ? "intel.skills.level" : "intel.skills.levels", { base: r.base, maximum: r.maximum })}</span>
    </button>)}</ProgressiveList>
    <p className="text-xs leading-relaxed text-subtle">{t("intel.skills.notice")}</p>
  </section>;
}
