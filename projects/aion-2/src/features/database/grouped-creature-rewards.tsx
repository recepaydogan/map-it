import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { ITEM_CATEGORY_GROUPS, WORLD_BOSS_REWARD_WEAPON_CATEGORIES } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import type { ReferenceLink, ReferenceRewardRate } from "../reference/reference-types";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import DatabaseSectionTitle from "./database-section-title";
import DropSearchHeader from "./drop-search-header";
import ItemGrade from "./item-grade";
import MarkerRewardItem from "./marker-reward-item";
import { useItemCatalog } from "./use-item-catalog";

interface Pool {
  key: string;
  chance: number;
  count: number;
  grade: string;
  family: "Weapons" | "Armor" | "Items";
  items: { link: ReferenceLink; rate: ReferenceRewardRate }[];
}

const armorAndAccessoryCategories = new Set<string>([...ITEM_CATEGORY_GROUPS.armor, ...ITEM_CATEGORY_GROUPS.accessories]);
const accessoryCategories = new Set<string>(ITEM_CATEGORY_GROUPS.accessories);

const rewardFamily = (category: string): Pool["family"] =>
  WORLD_BOSS_REWARD_WEAPON_CATEGORIES.includes(category) ? "Weapons"
    : armorAndAccessoryCategories.has(category) ? "Armor" : "Items";

const GroupedCreatureRewards = ({ links, onOpenItem }: { links: ReferenceLink[]; onOpenItem?: (id: string) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const [query, setQuery] = useState("");
  const catalog = useItemCatalog();
  const catalogItems = catalog.status === "ready" ? catalog.catalog.items : undefined;
  const itemsById = useMemo(() => new Map(catalogItems?.map((item) => [item.id, item]) ?? []), [catalogItems]);
  if (catalog.status === "loading") return <p role="status" className="text-xs text-subtle">{t("reference.loading")}</p>;
  if (catalog.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("database.acquisition.error")}</p>;
  const chance = (percent: number) => `${percent.toLocaleString(i18n.language, { maximumSignificantDigits: 3 })}%`;
  const rolls = (percent: number, count = 1) => <>
    <span className="block">{t("database.acquisition.trialGuaranteedRolls", { count: Math.floor(percent / 100) * count })}</span>
    {percent % 100 > 0 && <span className="block">{t(count > 1
      ? "database.acquisition.trialExtraRollChanceMultiple" : "database.acquisition.trialExtraRollChance", {
      count, chance: chance(percent % 100),
    })}</span>}
  </>;
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
    const item = itemsById.get(link.id);
    if (!item) {
      other.push(link);
      continue;
    }
    const family = rewardFamily(item.category);
    const key = JSON.stringify([rate.poolId ?? null, rate.poolPercent, rate.poolCount, item.grade, family]);
    const pool = poolMap.get(key) ?? { key, chance: rate.poolPercent, count: rate.poolCount, grade: item.grade, family, items: [] };
    pool.items.push({ link, rate });
    poolMap.set(key, pool);
  }

  direct.sort((a, b) => b.rate.percent - a.rate.percent);
  const pools = [...poolMap.values()].filter((pool) => {
    if (Math.abs(pool.items.reduce((total, item) => total + item.rate.percent, 0) - 100) <= 0.01) return true;
    other.push(...pool.items.map(({ link }) => link));
    return false;
  }).sort((a, b) => a.chance - b.chance);
  const search = query.trim().toLocaleLowerCase();
  const matches = (link: ReferenceLink) =>
    `${link.name} ${getItemDisplayName(link.name, gameText(link.name, link.id))}`.toLocaleLowerCase().includes(search);
  const shownPools = pools.map((pool) => ({ ...pool, optionCount: pool.items.length,
    items: search ? pool.items.filter(({ link }) => matches(link)) : pool.items }))
    .filter((pool) => pool.items.length);
  const shownOther = search ? other.filter(matches) : other;

  const row = ({ link, rate }: { link: ReferenceLink; rate: ReferenceRewardRate }) => {
    const quantity = rate.quantityMin === rate.quantityMax ? rate.quantityMin : `${rate.quantityMin}–${rate.quantityMax}`;
    return <MarkerRewardItem key={link.id} item={link}
      quantity={rate.kind === "direct" && rate.percent > 100 ? t("database.acquisition.trialQuantityPerRoll", { quantity }) : quantity}
      chance={rate.kind === "direct" && rate.percent > 100
        ? <span className="block text-right text-[11px]">{rolls(rate.percent)}</span> : chance(rate.percent)} onOpenItem={onOpenItem} />;
  };

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
        const family = pool.family === "Armor" && pool.items.some(({ link }) => accessoryCategories.has(itemsById.get(link.id)?.category ?? ""))
          ? "ArmorAccessories" : pool.family;
        return <details key={pool.key} open={search ? true : undefined}
          className="group/reward rounded-[var(--radius-sm)] border border-border bg-white/[0.025]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-zinc-100">
                {pool.grade && <><ItemGrade grade={pool.grade} />{" · "}</>}{t(`database.acquisition.rewardFamily${family}`)}
              </span>
              <span className="block text-[11px] text-subtle">{t(pool.chance > 100
                ? "database.acquisition.trialSelectionPerRoll" : "database.acquisition.trialSelection", {
                count: pool.count, items: pool.optionCount,
              })}</span>
            </span>
            <span className="shrink-0 text-right"><span className="block text-[10px] text-subtle">{t(pool.chance > 100
              ? "database.acquisition.trialPoolRolls" : "database.acquisition.trialPoolChance")}</span>
              {pool.chance > 100 ? <span className="block text-[11px] font-semibold tabular-nums text-accent">{rolls(pool.chance, pool.count)}</span>
                : <span className="text-[12px] font-semibold tabular-nums text-accent">{chance(pool.chance)}</span>}</span>
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
