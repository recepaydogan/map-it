import { Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../database/item-icon";
import type { ProfessionEntry } from "./profession-types";
import type { ProfessionLevelingGuide } from "./use-profession-leveling";

const lastSkillByProfession = new Map<string, number>();

const ProfessionLevelingPanel = ({ entry, guide, onOpenRecipe }: {
  entry: ProfessionEntry;
  guide: ProfessionLevelingGuide;
  onOpenRecipe: (recipeId: string) => void;
}) => {
  const { t } = useTranslation();
  const [skill, setSkill] = useState(() => Math.min(guide.maxSkill, lastSkillByProfession.get(entry.id) ?? 1));
  const activeRow = useRef<HTMLLIElement>(null);
  const skillEdited = useRef(false);
  const currentIndex = guide.steps.findIndex((step) => skill >= step.from && skill < step.to);
  const progress = Math.min(100, Math.max(0, (skill - 1) / Math.max(1, guide.maxSkill - 1) * 100));

  useEffect(() => {
    if (skillEdited.current) activeRow.current?.scrollIntoView({ block: "center" });
  }, [skill]);

  return <section>
    <div className="sticky top-0 z-10 rounded-b-[var(--radius-md)] border border-border bg-background/95 p-3 shadow-lg shadow-black/20 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-[12px] font-medium text-zinc-200">
          <span>{t("professions.leveling.currentSkill")}</span>
          <input type="number" min={1} max={guide.maxSkill} value={skill} onChange={(event) => {
            const next = Math.min(guide.maxSkill, Math.max(1, Number(event.target.value) || 1));
            skillEdited.current = true;
            lastSkillByProfession.set(entry.id, next);
            setSkill(next);
          }}
            className="h-9 w-[72px] rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-center text-[13px] tabular-nums text-white outline-none focus:border-accent" />
        </label>
        <span className="text-[11px] font-medium tabular-nums text-subtle">{currentIndex >= 0
          ? t("professions.leveling.stepProgress", { current: currentIndex + 1, total: guide.steps.length })
          : t("professions.leveling.complete", { skill: guide.maxSkill })}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={t("professions.leveling.currentSkill")}
        aria-valuemin={1} aria-valuemax={guide.maxSkill} aria-valuenow={skill}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
    </div>

    <div className="mt-5 flex items-end justify-between gap-3 px-1">
      <div>
        <h3 className="font-display text-[17px] font-semibold text-white">{t("professions.leveling.routeTitle")}</h3>
        <p className="mt-0.5 text-[11px] text-subtle">{t("professions.leveling.routeHint")}</p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-subtle">{t("professions.leveling.totalSteps", { count: guide.steps.length })}</span>
    </div>

    <ol className="relative mt-4 space-y-2 before:absolute before:bottom-5 before:left-[11px] before:top-5 before:w-px before:bg-border">{guide.steps.map((step, index) => {
      const active = index === currentIndex;
      const done = skill >= step.to;
      const recipe = "recipeName" in step ? entry.recipes.find((item) => item.name === step.recipeName) : undefined;
      const title = "recipeName" in step ? step.recipeName : step.targets.join(", ");
      const content = <>
        {recipe?.icon && <ItemIcon icon={recipe.icon} name={recipe.name} size={active ? 42 : 34} />}
        <span className="min-w-0 flex-1">
          <span className={`block text-[10px] font-semibold uppercase tracking-[0.1em] ${active ? "text-accent" : "text-subtle"}`}>
            {active ? `${t("professions.leveling.now")} · ` : ""}{t("professions.leveling.skillRange", { from: step.from, to: step.to })}
          </span>
          <span className={`mt-1 block leading-snug ${active ? "text-[15px] font-semibold text-white" : "text-[13px] font-medium text-zinc-200"}`}>{title}</span>
        </span>
        {"crafts" in step && typeof step.crafts === "number" && <span className="shrink-0 text-right">
          <span className={`block text-[14px] font-semibold tabular-nums ${active ? "text-white" : "text-zinc-200"}`}>
            {step.approximate ? "~" : ""}{step.crafts}
          </span>
          <span className="block text-[10px] text-subtle">{t("professions.leveling.craftsColumn")}</span>
        </span>}
        {recipe && <ChevronRight size={16} className={active ? "shrink-0 text-accent" : "shrink-0 text-subtle"} aria-hidden="true" />}
      </>;
      const cardClass = `flex min-h-[62px] w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors ${active
        ? "border-accent/60 bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]"
        : "border-border bg-surface/55 hover:border-accent/35 hover:bg-surface"}`;
      return <li key={`${step.from}-${step.to}-${index}`} ref={active ? activeRow : undefined} aria-current={active ? "step" : undefined}
        className="relative pl-8">
        <span className={`absolute left-0 top-1/2 z-[1] grid size-[23px] -translate-y-1/2 place-items-center rounded-full border text-[10px] font-semibold tabular-nums ${active
          ? "border-accent bg-accent text-on-accent"
          : done ? "border-success bg-success-soft text-success" : "border-border bg-background text-subtle"}`} aria-hidden="true">
          {done ? <Check size={12} strokeWidth={2.5} /> : index + 1}
        </span>
        {recipe ? <button type="button" onClick={() => onOpenRecipe(recipe.id)} className={`${cardClass} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}>
          {content}
        </button> : <div className={cardClass}>{content}</div>}
      </li>;
    })}</ol>

    {guide.kind === "crafting" && guide.hordeDifferences.length > 0 && <div className="mt-5 rounded-[var(--radius-md)] border border-border bg-surface/55 p-3 text-[12px] text-zinc-300">
      <h4 className="font-semibold text-white">{t("professions.leveling.hordeDifferences")}</h4>
      <ul className="mt-2 space-y-2">{guide.hordeDifferences.map((step) => {
        const recipe = entry.recipes.find((item) => item.name === step.recipeName);
        return <li key={`${step.from}-${step.to}-${step.recipeName}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular-nums text-subtle">{step.from}–{step.to}</span>
          {recipe ? <button type="button" onClick={() => onOpenRecipe(recipe.id)}
            className="inline-flex cursor-pointer items-center gap-0.5 font-medium text-accent hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
            {step.recipeName}<ChevronRight size={13} aria-hidden="true" />
          </button> : <span>{step.recipeName}</span>}
          <span className="tabular-nums text-subtle">· ~{step.crafts} {t("professions.leveling.craftsColumn").toLowerCase()}</span>
        </li>;
      })}</ul>
    </div>}
    {guide.kind === "crafting" && <p className="mt-4 px-1 text-[11px] leading-5 text-subtle">{t("professions.leveling.estimateNote")}</p>}
  </section>;
};

export default ProfessionLevelingPanel;
