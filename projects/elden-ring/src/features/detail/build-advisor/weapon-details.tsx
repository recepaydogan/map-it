import type { ReactNode } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../../components/tooltip";
import { colorFor, isWeak } from "../../../data/combat";
import { cn } from "../../../lib/cn";
import Chip from "./chip";
import StaggerPlanSummary from "./stagger-plan-summary";
import type { WeaponRecommendation } from "./types";

const statOrder = ["vig", "str", "dex", "int", "fai", "arc"] as const;
const statusTierPriority = { effective: 3, moderate: 2, resistant: 1, immune: 0 } as const;
const cap = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
const DAMAGE_MARK = "[[dmg]]";
const STATUS_MARK = "[[sta]]";
const BONUS_MARK = "[[bon]]";
const MARK_SPLIT = /(\[\[(?:dmg|sta|bon)\]\])/;

const DetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] py-2 first:border-t-0 first:pt-0">
    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-600">{label}</span>
    <span className="flex min-w-0 flex-wrap justify-end gap-1">{children}</span>
  </div>
);

const WeaponDetails = ({ weapon, onSelect }: { weapon: WeaponRecommendation; onSelect: () => void }) => {
  const { t } = useTranslation();
  const typeLabel = (type: string) => t(`combatType.${cap(type)}`, { defaultValue: cap(type) });
  const statusShare = weapon.statusScore / Math.max(1, weapon.fitScore);
  const primaryPart = [...weapon.damageParts].sort((a, b) => b.adjusted - a.adjusted)[0];
  const weaknessPart = weapon.damageParts
    .filter((part) => isWeak(part.multiplier))
    .sort((a, b) => b.multiplier - a.multiplier || b.adjusted - a.adjusted)[0];
  const featuredPart = weaknessPart ?? primaryPart;
  const featuredStatus = [...weapon.buildup].sort(
    (a, b) => statusTierPriority[b.tier] - statusTierPriority[a.tier] || b.value - a.value,
  )[0];
  const statusIsMinor = statusShare < 0.05 || featuredStatus?.tier === "resistant";
  const bossAdjustment = Math.round((weapon.adjustedAr / Math.max(1, weapon.rawAr) - 1) * 100);
  const signedAdjustment = `${bossAdjustment > 0 ? "+" : ""}${bossAdjustment}%`;
  const channels = [...weapon.damageParts]
    .filter((part) => part.adjusted > 0)
    .sort((a, b) => b.adjusted - a.adjusted);
  const channelTotal = channels.reduce((sum, part) => sum + part.adjusted, 0) || 1;
  const keyStatuses = weapon.buildup.filter((status) => status.tier === "effective");
  const restStatuses = weapon.buildup.filter((status) => status.tier !== "effective");
  const damageName = featuredPart ? typeLabel(featuredPart.type) : t("combatType.Physical");
  const damageColor = colorFor(featuredPart ? cap(featuredPart.type) : "Physical");
  const statusName = featuredStatus ? typeLabel(featuredStatus.type) : "";
  const statusColor = featuredStatus ? colorFor(cap(featuredStatus.type)) : undefined;
  const statusTier = featuredStatus ? t(`detail.buildAdvisor.statusTier.${featuredStatus.tier}`) : "";
  const damageBonus = featuredPart
    ? `${featuredPart.multiplier > 1 ? "+" : ""}${Math.round((featuredPart.multiplier - 1) * 100)}%`
    : "0%";
  const explanationKey = weaknessPart
    ? featuredStatus
      ? statusIsMinor ? "whyWeaknessMinorStatus" : "whyWeaknessAndStatus"
      : "whyWeakness"
    : featuredStatus
      ? statusIsMinor ? "whyDirectMinorStatus" : "whyDirectAndStatus"
      : "whyDirect";
  const explanation = t(`detail.buildAdvisor.${explanationKey}`, {
    damage: DAMAGE_MARK,
    bonus: BONUS_MARK,
    status: STATUS_MARK,
    tier: statusTier.toLocaleLowerCase(),
  }).split(MARK_SPLIT).map((chunk, index) => {
    if (chunk === DAMAGE_MARK) {
      return <strong key={index} className="font-semibold" style={{ color: damageColor }}>{damageName}</strong>;
    }
    if (chunk === STATUS_MARK) {
      return <strong key={index} className="font-semibold" style={{ color: statusColor }}>{statusName}</strong>;
    }
    if (chunk === BONUS_MARK) {
      return <strong key={index} className="font-semibold tabular-nums text-zinc-100">{damageBonus}</strong>;
    }
    return chunk;
  });

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-accent/20 bg-white/[0.035]">
      <div className="border-b border-white/[0.06] bg-black/15 px-3 py-2.5">
        <div className="flex items-end justify-between gap-2">
          <Tooltip label={t("detail.buildAdvisor.damageVsBossHint")} side="bottom" align="start" wrap className="min-w-0">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-[24px] font-bold leading-none tabular-nums text-accent">{weapon.adjustedAr}</span>
              <span className="text-[10px] tabular-nums text-zinc-500">{t("detail.buildAdvisor.baseAr", { value: weapon.rawAr })}</span>
            </p>
          </Tooltip>
          {bossAdjustment !== 0 && (
            <span className={cn(
              "shrink-0 rounded-[var(--radius-full)] px-2 py-1 text-[10px] font-bold tabular-nums",
              bossAdjustment > 0 ? "bg-accent/[0.14] text-accent" : "bg-rose-400/[0.12] text-rose-200",
            )}>
              {signedAdjustment}
            </span>
          )}
        </div>
        <div className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-[var(--radius-full)]" aria-hidden="true">
          {channels.map((part) => (
            <span
              key={part.type}
              className="h-full rounded-[var(--radius-full)]"
              style={{
                width: `${(part.adjusted / channelTotal) * 100}%`,
                background: colorFor(cap(part.type)),
                opacity: isWeak(part.multiplier) ? 1 : 0.45,
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1" aria-label={t("detail.buildAdvisor.damageChannels")}>
          {channels.map((part) => (
            <span key={part.type} className="flex items-center gap-1 text-[10px]">
              <span
                className="h-1.5 w-1.5 rounded-[var(--radius-full)]"
                style={{ background: colorFor(cap(part.type)), opacity: isWeak(part.multiplier) ? 1 : 0.45 }}
                aria-hidden="true"
              />
              <span className={isWeak(part.multiplier) ? "text-zinc-200" : "text-zinc-500"}>{typeLabel(part.type)}</span>
              <span className={cn("font-semibold tabular-nums", isWeak(part.multiplier) ? "text-zinc-100" : "text-zinc-400")}>
                {Math.round(part.adjusted)}
              </span>
            </span>
          ))}
          {keyStatuses.map((status) => (
            <span key={status.type} className="flex items-center gap-1 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-[var(--radius-full)]" style={{ background: colorFor(cap(status.type)) }} aria-hidden="true" />
              <span className="text-zinc-200">{typeLabel(status.type)}</span>
              <span className="font-semibold tabular-nums text-zinc-100">{status.value}</span>
            </span>
          ))}
        </div>
        {weapon.staggerPlan && <StaggerPlanSummary plan={weapon.staggerPlan} />}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5">
        <Lightbulb size={12} className="mt-[2px] shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[11px] leading-[1.5] text-zinc-400">{explanation}</p>
      </div>

      <div className="border-t border-white/[0.06] px-3 py-2.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-zinc-500">
          {t("detail.buildAdvisor.attributes")}
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {statOrder.map((stat) => (
            <div key={stat} className="rounded-[var(--radius-sm)] bg-black/25 px-1 py-1.5 text-center">
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-subtle">{t(`detail.buildAdvisor.stat.${stat}`)}</p>
              <p className="mt-0.5 text-[13px] font-bold leading-none tabular-nums text-zinc-100">{weapon.stats[stat]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-3 py-2.5">
        {weapon.attackTypes.length > 0 && (
          <DetailRow label={t("detail.buildAdvisor.physicalTypes")}>
            {weapon.attackTypes.map((type) => <Chip key={type} dot={colorFor(cap(type))}>{typeLabel(type)}</Chip>)}
          </DetailRow>
        )}
        {restStatuses.length > 0 && (
          <DetailRow label={t("detail.buildAdvisor.statusPotential")}>
            {restStatuses.map((status) => (
              <Chip key={status.type} dot={colorFor(cap(status.type))}>
                {typeLabel(status.type)}
                <span className="font-semibold tabular-nums text-zinc-100">{status.value}</span>
                <span className="text-zinc-500">{t(`detail.buildAdvisor.statusTier.${status.tier}`)}</span>
              </Chip>
            ))}
          </DetailRow>
        )}
        <DetailRow label={t("detail.buildAdvisor.startingClass")}>
          <Tooltip label={t("detail.buildAdvisor.fromClassHint")} side="top" align="end" wrap float>
            <Chip>{weapon.className}</Chip>
          </Tooltip>
        </DetailRow>
        <DetailRow label={t("detail.buildAdvisor.upgradeShort")}>
          <Chip><span className="tabular-nums">{t("detail.buildAdvisor.upgradeLabel", { level: weapon.upgrade, max: weapon.maxUpgrade })}</span></Chip>
        </DetailRow>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="group flex w-full cursor-pointer items-center justify-between border-t border-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-accent/[0.05]"
      >
        <span className="truncate text-[10.5px] font-semibold text-zinc-300 group-hover:text-accent">{weapon.item.name}</span>
        <ArrowRight size={13} className="shrink-0 text-zinc-500 group-hover:text-accent" aria-hidden="true" />
      </button>
    </section>
  );
};

export default WeaponDetails;
