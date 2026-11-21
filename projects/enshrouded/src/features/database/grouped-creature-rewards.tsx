import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { CREATURE_REWARD_LAYOUT_TRIAL, ITEM_CATEGORY_GROUPS } from "../../game-config";
import { getItemDisplayName } from "../../lib/item-display-name";
import type { ReferenceLink, ReferenceRewardRate } from "../reference/reference-types";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import DatabaseSectionTitle from "./database-section-title";
import DropSearchHeader from "./drop-search-header";
import ItemGrade from "./item-grade";
import MarkerRewardItem from "./marker-reward-item";
import { useItemCatalog } from "./use-item-catalog";

interface Pool {
  chance: number;
  count: number;
  items: { link: ReferenceLink; rate: ReferenceRewardRate }[];
}

const GroupedCreatureRewards = ({ links, onOpenItem }: { links: ReferenceLink[]; onOpenItem?: (id: string) => void }) => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const catalog = useItemCatalog();
  const catalogItems = catalog.status === "ready" ? catalog.catalog.items : undefined;
  const itemsById = useMemo(() => new Map(catalogItems?.map((item) => [item.id, item]) ?? []), [catalogItems]);
  const chance = (percent: number) => `${percent.toLocaleString(i18n.language, { maximumSignificantDigits: 3 })}%`;
  const direct: { link: ReferenceLink; rate: ReferenceRewardRate }[] = [];
  const other: ReferenceLink[] = [];
  const poolMap = new Map<string, Pool>();

  for (const link of links) {
    if (link.rewardRates?.length !== 1) {
      other.push(link);
      continue;
    }
    const rate = link.rewardRates[0];
    if (rate.kind === "direct") {
      direct.push({ link, rate });
      continue;
    }
    if (rate.poolPercent === undefined || rate.poolCount === undefined) {
      other.push(link);
      continue;
    }
    const key = `${rate.poolPercent}:${rate.poolCount}`;
    const pool = poolMap.get(key) ?? { chance: rate.poolPercent, count: rate.poolCount, items: [] };
    pool.items.push({ link, rate });
    poolMap.set(key, pool);
  }

  direct.sort((a, b) => b.rate.percent - a.rate.percent);
  const pools = [...poolMap.values()].sort((a, b) => a.chance - b.chance);
  const search = query.trim().toLocaleLowerCase();
  const matches = (link: ReferenceLink) => getItemDisplayName(link.name).toLocaleLowerCase().includes(search);
  const shownPools = pools.map((pool) => ({ ...pool, optionCount: pool.items.length,
    items: search ? pool.items.filter(({ link }) => matches(link)) : pool.items }))
    .filter((pool) => pool.items.length);
  const shownOther = search ? other.filter(matches) : other;

  const row = ({ link, rate }: { link: ReferenceLink; rate: ReferenceRewardRate }) =>
    <MarkerRewardItem key={link.id} item={link} quantity={rate.quantityMin === rate.quantityMax ? rate.quantityMin : `${rate.quantityMin}–${rate.quantityMax}`}
      chance={chance(rate.percent)} onOpenItem={onOpenItem} />;

  return <div className="space-y-5">
    {!!direct.length && <section className="space-y-2">
      <DatabaseSectionTitle>{t("database.acquisition.trialDirect")}</DatabaseSectionTitle>
      <div className="divide-y divide-border">{direct.map(row)}</div>
    </section>}

    {!!pools.length && <section>
      <DropSearchHeader title={t("database.acquisition.trialPools")} count={pools.reduce((total, pool) => total + pool.items.length, 0)}
        titleCount={pools.length} query={query} onQueryChange={setQuery} />
      <p className="mb-3 text-[11px] leading-4 text-subtle">{t("database.acquisition.trialPoolSummary", {
        items: pools.reduce((total, pool) => total + pool.items.length, 0), pools: pools.length,
      })}</p>
      <div className="space-y-2">{shownPools.map((pool) => {
        const first = itemsById.get(pool.items[0].link.id);
        const category = first?.category;
        const family = category && CREATURE_REWARD_LAYOUT_TRIAL.weaponCategories.includes(category) ? "Weapons"
          : category && (ITEM_CATEGORY_GROUPS.armor as readonly string[]).includes(category) ? "Armor" : "Items";
        return <details key={`${pool.chance}:${pool.count}`} open={search ? true : undefined}
          className="group/reward rounded-[var(--radius-sm)] border border-border bg-white/[0.025]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-zinc-100">
                {first?.grade && <><ItemGrade grade={first.grade} />{" "}</>}{t(`database.acquisition.rewardFamily${family}`)}
              </span>
              <span className="block text-[11px] text-subtle">{t("database.acquisition.trialSelection", { count: pool.count, items: pool.optionCount })}</span>
            </span>
            <span className="shrink-0 text-right"><span className="block text-[10px] text-subtle">{t("database.acquisition.trialPoolChance")}</span>
              <span className="text-[12px] font-semibold tabular-nums text-accent">{chance(pool.chance)}</span></span>
            <ChevronDown size={14} className="shrink-0 text-subtle transition-transform group-open/reward:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border px-2 pb-2 pt-2">
            <div className="flex justify-between gap-2 px-1 pb-1 text-[10px] text-subtle">
              <span>{t("database.acquisition.rewardItem")}</span><span>{t("database.acquisition.trialWithinPool")}</span>
            </div>
            <ProgressiveList initialCount={search ? pool.items.length : 8} className="divide-y divide-border">{pool.items.map(row)}</ProgressiveList>
          </div>
        </details>;
      })}</div>
      {search && !shownPools.length && !shownOther.length && <p className="mt-2 text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
    </section>}

    {!!shownOther.length && <section className="space-y-2">
      <DatabaseSectionTitle>{t("database.acquisition.otherDrops")}</DatabaseSectionTitle>
      <div className="divide-y divide-border">{shownOther.map((link) => <MarkerRewardItem key={link.id} item={link}
        chance={<ReferenceRewardRates rates={link.rewardRates} compact />} onOpenItem={onOpenItem} />)}</div>
    </section>}
  </div>;
};

export default GroupedCreatureRewards;
