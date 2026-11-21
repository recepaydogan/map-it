import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import type { DungeonMechanic } from "./reference-types";

const DungeonCombatMechanics = ({ mechanics }: { mechanics: DungeonMechanic[] }) => {
  const { t, i18n } = useTranslation();
  if (!mechanics.length) return null;
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent", signDisplay: "always", maximumFractionDigits: 2 });
  return <section className="space-y-4">
    <DatabaseSectionTitle>{t("reference.guide.conditionalDefense")}</DatabaseSectionTitle>
    {mechanics.map((mechanic, index) => <div key={`${mechanic.name}-${index}`} className="space-y-2">
      <h4 className="text-[13px] font-semibold text-zinc-100">{mechanic.name}</h4>
      <div className="flex flex-wrap gap-1.5">{mechanic.stats.map((stat) => <span key={stat.name} className="rounded-full border border-accent/20 bg-accent-soft px-2 py-1 text-xs text-zinc-200">
        {stat.name} <strong className="font-semibold tabular-nums">{percent.format(stat.percent / 100)}</strong>
      </span>)}</div>
      {mechanic.triggers.length > 0 ? <p className="text-[13px] leading-relaxed text-subtle">{t("reference.guide.defeatTrigger", { names: [...new Set(mechanic.triggers.flatMap((trigger) => trigger.names))].join(" · ") })}</p>
        : <p className="text-[13px] leading-relaxed text-subtle">{t(mechanic.origin === "skill" ? "reference.guide.skillTrigger" : "reference.guide.encounterTrigger")}</p>}
      {mechanic.maxStacks > 1 && <p className="text-xs text-subtle">{t("reference.adventure.effectStacks", { count: mechanic.maxStacks })}</p>}
    </div>)}
    <p className="text-xs text-subtle">{t("reference.guide.conditionalStatNotice")}</p>
  </section>;
};
export default DungeonCombatMechanics;
