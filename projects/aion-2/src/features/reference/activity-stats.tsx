import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ReferenceFact } from "./reference-types";

const COMBAT_POWER = "reference.labels.recommended-combat-power";

const ActivityStats = ({ bossLevel, facts }: { bossLevel?: number; facts: ReferenceFact[] }) => {
  const { t, i18n } = useTranslation();
  const combatPower = facts.find((fact) => fact.label === COMBAT_POWER);
  const stats = [
    ...(combatPower ? [combatPower] : []),
    ...(bossLevel ? [{ label: "reference.activity.bossLevel", value: bossLevel }] : []),
    ...facts.filter((fact) => fact.label !== COMBAT_POWER),
  ];
  if (!stats.length) return null;

  return <dl className={cn("grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border",
    stats.length > 1 && "@min-[360px]:grid-cols-2",
    stats.length === 3 && "@min-[500px]:grid-cols-3",
    stats.length >= 4 && "@min-[640px]:grid-cols-4")}>
    {stats.map((stat, index) => <div key={stat.label}
      className={cn("flex min-h-20 min-w-0 flex-col justify-between gap-3 px-4 py-3", index === 0 ? "bg-elevated" : "bg-surface")}>
      <dt className="text-xs leading-4 text-zinc-300">{t(stat.label)}</dt>
      <dd className={cn("font-semibold leading-none tabular-nums", index === 0 ? "text-[26px] text-accent" : "text-xl text-white")}>
        {Number(stat.value).toLocaleString(i18n.language)}
      </dd>
    </div>)}
  </dl>;
};

export default ActivityStats;
