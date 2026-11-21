import { useState } from "react";
import { cn } from "../../lib/cn";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import { adventureVariant } from "./adventure-presentation";
import DungeonDetailPanel from "./dungeon-detail-panel";
import QuestDetailPanel from "./quest-detail-panel";
import WorldEntryContent from "./world-entry-content";
import { useReferenceEntries, useReferenceIndex } from "./use-reference-data";
import type { ReferenceTarget } from "./reference-types";
import { useMarkerItems } from "../database/use-marker-items";
import type { MapCompanionSource } from "../map/map-companion-sources";
import { inlineGatheringSource } from "./inline-gathering-source";
import { chestDungeonId } from "./chest-dungeon-context";
import ChestDungeonGuide from "./chest-dungeon-guide";

const MapMarkerAdventure = ({ reference, showDrops = true, showDescription = true, showFacts = true, showDivider = true, showCombatAbilities = false, mapId, markerId, onOpenMap, companionSources, objectVariants }: {
  reference: ReferenceTarget; showDrops?: boolean; showDescription?: boolean; showFacts?: boolean; showDivider?: boolean; showCombatAbilities?: boolean; mapId: string; markerId: string; onOpenMap: (mapId: string, markerId: string) => void; companionSources?: MapCompanionSource[]; objectVariants?: ReferenceTarget[];
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const index = useReferenceIndex();
  const loot = useMarkerItems(mapId, markerId);
  const [selected, setSelected] = useState("");
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === reference.id && entry.category === reference.category) : undefined;
  const variantIds = new Set(objectVariants?.map((variant) => variant.id));
  const summaries = index.status === "ready" ? index.data.entries.filter((entry) => entry.id === summary?.id || variantIds.has(entry.id)) : [];
  const state = useReferenceEntries(summaries, ["dungeons", "gathering"]);
  if (index.status === "error" || state.status === "error" || (index.status === "ready" && !summary)) return <p role="alert" className="py-3 text-sm text-subtle">{t("reference.error")}</p>;
  if (index.status !== "ready" || state.status !== "ready") return <p role="status" className="py-3 text-sm text-subtle">{t("reference.loading")}</p>;
  const source = state.data.find((entry) => entry.id === reference.id);
  const displayedSource = source ? inlineGatheringSource(source, state.data) : undefined;
  const chestDungeon = chestDungeonId(displayedSource, mapId, markerId);
  const chestDungeonSummary = chestDungeon ? index.data.entries.find((entry) => entry.id === chestDungeon) : undefined;
  const dungeons = state.data.filter((entry) => entry.category === "dungeons");
  const current = dungeons.find((entry) => entry.id === selected) ?? dungeons[0];
  const existingDrops = !showDrops && loot.status === "ready" ? new Set([
    ...loot.items.map((item) => item.id),
    ...loot.rewards.flatMap((group) => [...group.items, ...group.packages.flatMap((pack) => pack.items)].map((item) => item.id)),
  ]) : undefined;
  return <div className={cn("mt-4 empty:hidden [&:has(>div:empty)]:hidden", showDivider && "border-t border-border pt-4")}>
    {current ? <>
      {source?.sections.some((section) => section.title === "reference.adventure.dungeonGuide") && <p className="mb-3 text-xs leading-relaxed text-subtle">{t("reference.adventure.guideNotice")}</p>}
      {dungeons.length > 1 && <div className="mb-3"><CategoryDropdown ariaLabel={t("reference.adventure.selectVariant")} value={current.id} onChange={setSelected} options={dungeons.map((entry) => ({ key: entry.id, label: `${gameText(entry.name)} · ${adventureVariant(entry, t)}` }))} /></div>}
      <DungeonDetailPanel key={current.id} entry={current} compact onOpenMap={onOpenMap} />
    </> : source?.category === "quests" ? <QuestDetailPanel entry={source} compact onOpenMap={onOpenMap} />
      : displayedSource ? <>
        <WorldEntryContent entry={displayedSource} objectVariants={state.data.filter((entry) => variantIds.has(entry.id))} showDrops={showDrops || (displayedSource.category !== "creatures" && loot.status !== "loading")} showDescription={showDescription} showFacts={showFacts} showDungeonContexts={false} showCombatAbilities={showCombatAbilities} showCombatAbilityList={false} excludeDropItems={existingDrops} companionSources={companionSources} />
        {chestDungeonSummary && <ChestDungeonGuide key={chestDungeonSummary.id} summary={chestDungeonSummary} objectId={displayedSource.id} />}
      </> : null}
  </div>;
};
export default MapMarkerAdventure;
