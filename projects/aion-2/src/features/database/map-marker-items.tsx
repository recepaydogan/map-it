import { useRewardOrder } from "./use-reward-order";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import ProgressiveList from "../../components/progressive-list";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import ItemIcon from "./item-icon";
import ItemGrade from "./item-grade";
import MarkerRewardItem from "./marker-reward-item";
import DropSearchHeader from "./drop-search-header";
import MapMarkerRewards from "./map-marker-rewards";
import GroupedCreatureRewards from "./grouped-creature-rewards";
import FirstKillTitles from "../reference/first-kill-titles";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import type { ReferenceTarget } from "../reference/reference-types";
import { sameReferenceTarget, useSelectedReference } from "../reference/reference-navigation-context";
import { useMarkerItems, type MarkerItemSummary } from "./use-marker-items";
import { markerSupplementalDrops } from "./marker-supplemental-drops";

const MapMarkerItems = ({ mapId, markerId, category, reference, linkedItem, linkedItemLabelKey, onOpenItem, hasReferenceDetails = false, excludedDropIds = [] }: {
  mapId: string;
  markerId: string;
  category: string;
  reference?: ReferenceTarget;
  linkedItem?: { id: string; name: string; icon?: string };
  linkedItemLabelKey?: string;
  onOpenItem?: (itemId: string) => void;
  hasReferenceDetails?: boolean;
  excludedDropIds?: string[];
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const displayName = (name: string, id: string) => getItemDisplayName(name, gameText(name, id));
  const selectedReference = useSelectedReference();
  const orderRewards = useRewardOrder();
  const state = useMarkerItems(mapId, markerId);
  const lookupGatheringResults = Boolean(linkedItem && reference?.category === "exploration");
  const creatureDrops = reference?.category === "creatures";
  const lookupReference = lookupGatheringResults || creatureDrops;
  const index = useReferenceIndex(lookupReference);
  const summary = lookupReference && index.status === "ready"
    ? index.data.entries.find((entry) => entry.id === reference?.id && entry.category === reference.category)
    : undefined;
  const referenceEntry = useReferenceEntry(summary);
  const [showShared, setShowShared] = useState(false);
  const [dropQuery, setDropQuery] = useState("");
  const [cubeQuery, setCubeQuery] = useState("");
  const items = state.status === "ready" ? state.items : [];
  const rewards = state.status === "ready" ? state.rewards : [];
  const firstKillTitles = creatureDrops && referenceEntry.status === "ready"
    ? referenceEntry.data.sections.find((section) => section.title === "reference.loot.firstKillTitle")?.links ?? [] : [];
  const supplementalDrops = markerSupplementalDrops(items, rewards,
    creatureDrops && referenceEntry.status === "ready" ? referenceEntry.data.sections : [], excludedDropIds);
  const cubeSection = category === "dungeon-boss" && referenceEntry.status === "ready"
    ? referenceEntry.data.sections.find((section) => section.title === "reference.labels.dungeon-rewards"
      && section.markerIds?.includes(markerId)) : undefined;
  const cubeRewards = cubeSection?.links?.filter((link) => link.category === "items") ?? [];
  const cubeSearch = cubeRewards.length > 30 ? cubeQuery.trim().toLocaleLowerCase() : "";
  const visibleCubeRewards = cubeSearch ? cubeRewards.filter((item) =>
    `${item.name} ${displayName(item.name, item.id)}`.toLocaleLowerCase().includes(cubeSearch)) : cubeRewards;
  const unifiedRewards = creatureDrops || rewards.length > 0;
  const worldBossDrops = creatureDrops && referenceEntry.status === "ready" && referenceEntry.data.group === "Boss"
    && referenceEntry.data.worldBoss?.length
    ? referenceEntry.data.sections.filter((section) => ["reference.labels.possible-drops", "reference.labels.guaranteed-drops"].includes(section.title))
      .flatMap((section) => section.links ?? []).filter((link) => link.category === "items" && !excludedDropIds.includes(link.id))
    : [];
  const creatureLoading = creatureDrops && (index.status === "loading" || (summary && referenceEntry.status === "loading"));
  const creatureError = creatureDrops && (index.status === "error" || referenceEntry.status === "error"
    || (index.status === "ready" && !summary));

  const dropItems = items.filter((item) => item.sourceScope);
  const specificItems = dropItems.filter((item) => item.sourceScope === "specific");
  const sharedItems = dropItems.filter((item) => item.sourceScope === "shared");
  const dropSearch = dropItems.length > 30 ? dropQuery.trim().toLocaleLowerCase() : "";
  const matchingDrops = (item: MarkerItemSummary) =>
    `${item.name} ${displayName(item.name, item.id)}`.toLocaleLowerCase().includes(dropSearch);
  const visibleSpecificItems = dropSearch ? specificItems.filter(matchingDrops) : specificItems;
  const visibleSharedItems = dropSearch ? sharedItems.filter(matchingDrops) : sharedItems;
  const gatheringResultIds = new Set([
    ...(referenceEntry.status === "ready" ? referenceEntry.data.sections
      .filter((section) => section.title === "reference.adventure.gatheringResults")
      .flatMap((section) => section.links?.map((link) => link.id) ?? []) : []),
  ]);
  const gatheringResultsLoading = lookupGatheringResults && (index.status === "loading" || (summary && referenceEntry.status === "loading"));
  const rewardIds = new Set([...supplementalDrops.map((item) => item.id), ...rewards.flatMap((group) =>
    [...group.items, ...group.packages.flatMap((pack) => pack.items)].map((item) => item.id))]);
  const otherItems = items.filter((item) => !item.sourceScope && !gatheringResultIds.has(item.id)
    && !(unifiedRewards && rewardIds.has(item.id)) && !excludedDropIds.includes(item.id));
  const showLinkedItem = linkedItem && !items.some((item) => item.id === linkedItem.id)
    && !gatheringResultIds.has(linkedItem.id) && !gatheringResultsLoading;
  const hasVerifiedItems = Boolean(showLinkedItem || items.length || rewards.length || supplementalDrops.length || cubeRewards.length);
  const showNoVerifiedItems = state.status === "ready" && !hasVerifiedItems && !hasReferenceDetails && ["boss", "dungeon-boss", "enemy", "merchant"].includes(category);
  const itemRows = (items: MarkerItemSummary[], initialCount?: number) => <ProgressiveList initialCount={initialCount} className="space-y-1.5">
    {orderRewards(items).map((item) => <button key={item.id} type="button" disabled={!onOpenItem} onClick={() => onOpenItem?.(item.id)}
      aria-pressed={onOpenItem && selectedReference !== undefined ? sameReferenceTarget(selectedReference, { category: "items", id: item.id }) : undefined}
      className={cn("flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:cursor-default",
        sameReferenceTarget(selectedReference, { category: "items", id: item.id }) ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.03]")}>
      <ItemIcon icon={item.icon} name={displayName(item.name, item.id)} size={28} />
      <span className="min-w-0 flex-1 text-[12px] text-zinc-100"><span className="block truncate">{displayName(item.name, item.id)}</span>
        {(item.sourceScope || gatheringResultIds.has(item.id)) && <ReferenceRewardRates rates={item.rewardRates} />}
      </span>
      <ItemGrade grade={item.grade} className="shrink-0 text-[10px]" />
    </button>)}
  </ProgressiveList>;

  if (state.status === "ready" && !showLinkedItem && !rewards.length
    && !firstKillTitles.length && !supplementalDrops.length && !cubeRewards.length && !dropItems.length && !otherItems.length && !showNoVerifiedItems && !creatureLoading && !creatureError) return null;

  return <section className="mt-4 border-t border-border pt-4">
    {showLinkedItem && <div className="mb-3">
      <h3 className="map-micro-label mb-2">{t(linkedItemLabelKey ?? "database.acquisition.markerItems", { count: 1 })}</h3>
      <button type="button" disabled={!onOpenItem} onClick={() => onOpenItem?.(linkedItem.id)}
        aria-pressed={onOpenItem && selectedReference !== undefined ? sameReferenceTarget(selectedReference, { category: "items", id: linkedItem.id }) : undefined}
        className={cn("flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:cursor-default",
          sameReferenceTarget(selectedReference, { category: "items", id: linkedItem.id }) ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.03]")}>
        <ItemIcon icon={linkedItem.icon} name={displayName(linkedItem.name, linkedItem.id)} size={28} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-100">{displayName(linkedItem.name, linkedItem.id)}</span>
      </button>
    </div>}
    {state.status === "error" && <p className="text-[12px] text-danger-text" role="alert">{t("database.acquisition.error")}</p>}
    {(state.status === "loading" || creatureLoading) && <p role="status" className="text-xs text-subtle">{t("reference.loading")}</p>}
    {creatureError && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {showNoVerifiedItems && <p className="text-[11px] leading-4 text-zinc-400">{t("map.details.noVerifiedItems")}</p>}
    {!!worldBossDrops.length && <><GroupedCreatureRewards links={worldBossDrops} onOpenItem={onOpenItem} />
      <FirstKillTitles titles={firstKillTitles} /></>}
    {unifiedRewards && !worldBossDrops.length && <MapMarkerRewards groups={rewards} firstKillTitles={firstKillTitles} supplementalDrops={supplementalDrops}
      worldBoss={category === "boss" || Boolean(summary?.worldBoss?.length)} onOpenItem={onOpenItem} />}
    {!!cubeRewards.length && <section className="mt-4 space-y-2">
      <DropSearchHeader title={t("reference.labels.dungeon-rewards")} count={cubeRewards.length} titleCount={cubeRewards.length}
        query={cubeQuery} onQueryChange={setCubeQuery} searchLabel={t("reference.adventure.searchRewards")} />
      {cubeSection?.summaryNotice && <p className="text-[11px] leading-4 text-subtle">{t(cubeSection.summaryNotice)}</p>}
      {cubeSection?.facts?.map((fact) => <p key={fact.label} className="text-[11px] text-subtle">{t(fact.label)}: {fact.value}</p>)}
      <ProgressiveList initialCount={cubeSearch ? visibleCubeRewards.length : 8} className="divide-y divide-border">
        {orderRewards(visibleCubeRewards).map((item) => <MarkerRewardItem key={item.id} item={item} onOpenItem={onOpenItem} />)}
      </ProgressiveList>
      {cubeSearch && !visibleCubeRewards.length && <p className="text-xs text-subtle">{t("reference.adventure.noMatchingRewards")}</p>}
    </section>}
    {dropItems.length > 0 && !unifiedRewards && <>
      <DropSearchHeader title={t("database.acquisition.possibleDrops", { count: dropItems.length })}
        count={dropItems.length} query={dropQuery} onQueryChange={setDropQuery} />
      {visibleSpecificItems.length > 0 && <>
        <h4 className="map-micro-label mb-2">{t("database.acquisition.specificDrops", { count: visibleSpecificItems.length })}</h4>
        {itemRows(visibleSpecificItems, dropSearch ? visibleSpecificItems.length : undefined)}
      </>}
      {visibleSharedItems.length > 0 && <div className="mt-3">
        {dropSearch
          ? <h4 className="map-micro-label">{t("database.acquisition.sharedDrops", { count: visibleSharedItems.length })}</h4>
          : <button type="button" onClick={() => setShowShared((value) => !value)} aria-expanded={showShared} className="cursor-pointer text-left text-[12px] font-semibold text-accent hover:underline">{t("database.acquisition.sharedDrops", { count: sharedItems.length })}</button>}
        {(dropSearch || showShared) && <div className="mt-2">
          {itemRows(visibleSharedItems, dropSearch ? visibleSharedItems.length : undefined)}
        </div>}
      </div>}
      {dropSearch && !visibleSpecificItems.length && !visibleSharedItems.length && <p className="text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
    </>}
    {otherItems.length > 0 && <div className={dropItems.length > 0 ? "mt-4" : undefined}>
      <h3 className="map-micro-label mb-2">{t("database.acquisition.markerItems", { count: otherItems.length })}</h3>
      {itemRows(otherItems)}
    </div>}
  </section>;
};

export default MapMarkerItems;
