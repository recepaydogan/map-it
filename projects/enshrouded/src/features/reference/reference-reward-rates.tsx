import { isSingleDrawAmountPool } from "./reward-amount-pool";
import { useTranslation } from "react-i18next";
import type { ReferenceRewardRate } from "./reference-types";
import { formatDropChance } from "../../lib/format-drop-chance";
import WorldObjectRewardRates from "./world-object-reward-rates";



const ReferenceRewardRates = ({ rates, compact = false, activity = false }: { rates?: ReferenceRewardRate[]; compact?: boolean; activity?: boolean }) => {
  const { t, i18n } = useTranslation();
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 6 });
  if (!rates?.length) return <span className="mt-1 block text-[11px] text-subtle">{t("reference.dungeon.rateUnavailable")}</span>;
  if (rates.every((rate) => rate.contextKey?.startsWith("reference.worldObject."))) return <WorldObjectRewardRates rates={rates} />;
  if (compact) return <span className="shrink-0 text-[11px] tabular-nums text-accent" title={rates.some((rate) => rate.kind === "pool") ? t("reference.dungeon.poolChanceContext") : undefined}>{rates.map((rate) => rate.percent <= 100
    ? formatDropChance(rate.percent, i18n.language)
    : t("reference.dungeon.multipleRewards")).join(" / ")}</span>;
  const poolRates = rates.filter((rate) => rate.kind === "pool");
  const groupedPool = activity && isSingleDrawAmountPool(poolRates);
  if (activity) return <span className="mt-1 block space-y-2 text-[11px] leading-relaxed text-subtle">{rates.map((rate, index) => {
    if (groupedPool && rate.kind === "pool") {
      if (rate !== poolRates[0]) return null;
      return <span key={index} className="block">
        <span className="block font-medium text-zinc-200">{t("reference.activity.onePoolAmount")}</span>
        <span className="mt-2 block divide-y divide-border/50">
          <span className="flex justify-between gap-4 pb-1 text-subtle"><span>{t("reference.activity.rewardQuantity")}</span><span>{t("reference.activity.rewardChance")}</span></span>
          {[...poolRates].sort((a, b) => a.quantityMin - b.quantityMin).map((choice, choiceIndex) => <span key={choiceIndex} className="flex justify-between gap-4 py-1 tabular-nums"><span className="text-zinc-200">×{number(choice.quantityMin)}</span><span className="text-accent">{formatDropChance(choice.percent, i18n.language)}</span></span>)}
        </span>
        {rate.contextKey && <span className="mt-1 block">{t(rate.contextKey)}{rate.levelMin !== undefined && ` · ${t("reference.loot.levelRange", { min: rate.levelMin, max: rate.levelMax })}`}</span>}
        <span className="block">{t("reference.activity.poolChanceNotice")}</span>
      </span>;
    }
    if (rate.kind === "direct" && rate.contextKey === "reference.loot.key" && rate.percent === 100) {
      const quantity = rate.quantityMin === rate.quantityMax ? number(rate.quantityMin) : `${number(rate.quantityMin)}–${number(rate.quantityMax)}`;
      return <span key={index} className="block"><span className="block font-medium text-zinc-200">{t("reference.activity.keyRewardAmount", { quantity })}</span><span className="block">{t("reference.activity.keyRewardCondition")}</span></span>;
    }
    const chance = rate.percent <= 100 ? t("reference.dungeon.dropChance", { chance: formatDropChance(rate.percent, i18n.language) }) : t("reference.dungeon.multipleRewards");
    const quantity = rate.quantityMin === rate.quantityMax ? number(rate.quantityMin) : `${number(rate.quantityMin)}–${number(rate.quantityMax)}`;
    return <span key={index} className="block"><span className="text-accent">{chance}</span>{` · ×${quantity}`}
      {rate.enhancementLevel !== undefined && ` · +${rate.enhancementLevel}`}
      {rate.faction && ` · ${rate.faction}`}
      {rate.contextKey && rate.contextKey !== "reference.loot.additional" && <span className="block">{t(rate.contextKey)}{rate.levelMin !== undefined && ` · ${t("reference.loot.levelRange", { min: rate.levelMin, max: rate.levelMax })}`}</span>}
    </span>;
  })}</span>;
  return <span className="mt-1 block space-y-1">{rates.map((rate, index) => {
    // Values over 100% encode multiple rewards; do not present them as a single chance.
    const chance = rate.percent <= 100
      ? t("reference.dungeon.dropChance", { chance: formatDropChance(rate.percent, i18n.language) })
      : t("reference.dungeon.multipleRewards");
    const quantity = rate.quantityMin === rate.quantityMax ? number(rate.quantityMin)
      : `${number(rate.quantityMin)}–${number(rate.quantityMax)}`;
    return <span key={index} className="block text-[11px] leading-relaxed text-subtle">
      <span className="text-accent" title={rate.kind === "pool" ? t("reference.dungeon.poolChanceContext") : undefined}>{chance}</span>{` · ×${quantity}`}
      {rate.enhancementLevel !== undefined && ` · +${rate.enhancementLevel}`}
      {rate.faction && ` · ${rate.faction}`}
      {rate.contextKey && (rate.contextKey !== "reference.loot.additional" || rate.levelMin !== undefined) && <span className="block">{rate.contextKey !== "reference.loot.additional" && t(rate.contextKey)}{rate.levelMin !== undefined && `${rate.contextKey !== "reference.loot.additional" ? " · " : ""}${t("reference.loot.levelRange", { min: rate.levelMin, max: rate.levelMax })}`}</span>}
    </span>;
  })}</span>;
};

export default ReferenceRewardRates;
