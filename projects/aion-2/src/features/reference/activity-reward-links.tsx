import { useRewardOrder } from "../database/use-reward-order";
import DatabaseSectionTitle from "../database/database-section-title";
import { cn } from "../../lib/cn";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { formatDropChance } from "../../lib/format-drop-chance";
import { getItemDisplayName } from "../../lib/item-display-name";
import { factionDisplayName } from "../../lib/faction-display-name";
import { useGameText } from "../../i18n/game-text";
import ItemIcon from "../database/item-icon";
import { openReference } from "./reference-navigation";
import { ReferenceNavigationContext } from "./reference-navigation-context";
import { isSingleDrawAmountPool } from "./reward-amount-pool";
import type { ReferenceLink, ReferenceRewardRate } from "./reference-types";

const RewardBreakdown = ({ rates }: { rates: ReferenceRewardRate[] }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 6 });
  const groups = new Map<string, ReferenceRewardRate[]>();
  for (const rate of rates) {
    const key = JSON.stringify([rate.kind, rate.contextKey, rate.levelMin, rate.levelMax, rate.faction, rate.enhancementLevel, rate.poolPercent, rate.poolCount]);
    groups.set(key, [...(groups.get(key) ?? []), rate]);
  }
  return <div className="divide-y divide-border">{[...groups].map(([key, group]) => {
    const first = group[0];
    const singleAmount = isSingleDrawAmountPool(group);
    const fixed = group.every((rate) => rate.kind === "direct" && rate.percent === 100);
    const title = first.contextKey === "reference.loot.key" ? "reference.activity.rewardLayout.key"
      : first.contextKey ?? "reference.activity.rewardLayout.standard";
    return <section key={key} className="space-y-2 px-3 py-3">
      <DatabaseSectionTitle>{t(title)}</DatabaseSectionTitle>
      {singleAmount && <p className="text-sm leading-5 text-subtle">{t("reference.activity.rewardLayout.oneAmount")}</p>}
      {fixed ? <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold tabular-nums text-accent">{group.map((rate) => rate.quantityMin === rate.quantityMax ? `×${number(rate.quantityMin)}` : `×${number(rate.quantityMin)}–${number(rate.quantityMax)}`).join(" + ")}</span>
        <span className="text-sm text-subtle">{t("reference.activity.rewardLayout.fixed")}</span>
      </div> : <div className="space-y-1.5 text-sm tabular-nums">
        {[...group].sort((a, b) => a.quantityMin - b.quantityMin).map((rate, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-3 py-2.5">
          <span className="font-medium text-white">×{number(rate.quantityMin)}{rate.quantityMin !== rate.quantityMax && `–${number(rate.quantityMax)}`}</span>
          <span className="text-accent">{rate.percent <= 100 ? formatDropChance(rate.percent, i18n.language) : t("reference.dungeon.multipleRewards")}</span>
        </div>)}
      </div>}
      {first.levelMin !== undefined && <p className="text-sm text-subtle">{t("reference.loot.levelRange", { min: first.levelMin, max: first.levelMax })}</p>}
      {first.faction && <p className="text-sm text-subtle">{factionDisplayName(first.faction, t, gameText)}</p>}
      {first.enhancementLevel !== undefined && <p className="text-sm text-subtle">{t("reference.activity.rewardLayout.enhancement", { level: first.enhancementLevel })}</p>}
    </section>;
  })}</div>;
};

const ActivityRewardLinks = ({ links, initialCount }: { links: ReferenceLink[]; initialCount?: number }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const navigate = useContext(ReferenceNavigationContext);
  const orderRewards = useRewardOrder();
  const id = useId();
  const [expanded, setExpanded] = useState<string | null>(null);
  const number = (value: number) => value.toLocaleString(i18n.language);
  return <div className="@container">
    <ProgressiveList initialCount={initialCount} className="grid gap-1.5 @min-[680px]:grid-cols-2">{orderRewards(links).map((link, index) => {
      const rates = link.rewardRates ?? [];
      const rate = rates.length === 1 ? rates[0] : undefined;
      const min = rates.length ? Math.min(...rates.map((r) => r.quantityMin)) : link.quantity;
      const max = rates.length ? Math.max(...rates.map((r) => r.quantityMax)) : link.quantity;
      const hasDetails = rates.length > 1 || Boolean(rate && (rate.contextKey || rate.faction || rate.levelMin !== undefined || rate.enhancementLevel !== undefined));
      const rowId = `${id}-${index}`;
      const open = expanded === rowId;
      const chance = rate ? rate.percent <= 100 ? formatDropChance(rate.percent, i18n.language) : t("reference.activity.rewardLayout.multiRoll")
        : rates.length ? t("reference.activity.rewardLayout.varies") : "—";
      const displayName = getItemDisplayName(link.name, gameText(link.name, link.id));
      return <div key={`${link.id}-${index}`}>
        <button type="button" onClick={() => (navigate ?? openReference)(link)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
          {link.icon ? <ItemIcon icon={link.icon} name={displayName} size={32} /> : <Package size={18} className="shrink-0 text-subtle" aria-hidden="true" />}
          <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-100">{displayName}
            {min !== undefined && <span className="ml-1.5 text-xs font-normal tabular-nums text-subtle" title={t("reference.activity.rewardLayout.perAward")}>×{number(min)}{max !== min && `–${number(max!)}`}</span>}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-accent">{chance}</span>
          <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
        </button>
        {hasDetails && <div className="mt-1.5">
          <button type="button" aria-expanded={open} aria-controls={rowId} aria-label={t("reference.activity.rewardLayout.detailsFor", { name: displayName })}
            onClick={() => setExpanded(open ? null : rowId)} className="flex cursor-pointer items-center gap-1 px-3 py-1 text-xs text-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            {t("reference.activity.rewardLayout.details")}<ChevronDown size={14} aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
          </button>
          <div id={rowId} hidden={!open} className="ml-3 border-l border-accent/30"><RewardBreakdown rates={rates} /></div>
        </div>}
      </div>;
    })}</ProgressiveList>
    {links.some((link) => link.rewardRates?.some((rate) => rate.kind === "pool")) && <p className="pt-2 text-xs leading-5 text-subtle">{t("reference.activity.poolChanceNotice")}</p>}
  </div>;
};

export default ActivityRewardLinks;
