import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import { ChevronLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReferenceDetail from "../reference/reference-detail";
import CreatureDetail from "../reference/creature-detail";
import ActivityDetail from "../reference/activity-detail";
import { groupActivities } from "../reference/activity-families";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ReferenceTarget } from "../reference/reference-types";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import { hasMapDefinition } from "./map-registry";
import MapDungeonReferencePanel from "./map-dungeon-reference-panel";
import MapItemPanel from "./map-item-panel";
import MapRecipePanel from "./map-recipe-panel";
import MapRewardBoxPanel from "./map-reward-box-panel";
import MapSpellPanel from "./map-spell-panel";
import DungeonBossDetailPanel from "../reference/dungeon-boss-detail-panel";
import { isDungeonBossTarget } from "../reference/dungeon-boss-target";
import DungeonQuestDetailPanel from "../reference/dungeon-quest-detail-panel";
import { isDungeonQuestTarget } from "../reference/dungeon-quest-target";
import DungeonNpcDetailPanel from "../reference/dungeon-npc-detail-panel";
import { isDungeonNpcTarget } from "../reference/dungeon-npc-target";
import NativeWikiDetail from "../reference/native-wiki-detail";
import { NATIVE_WIKI_CATEGORIES } from "../reference/use-native-wiki";

type Props = {
  target: ReferenceTarget;
  backLabel: string;
  openedFromDungeon?: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpenMap: (mapId: string, markerId: string) => void;
};

const EntryPanel = ({ target, onOpenMap }: Pick<Props, "target" | "onOpenMap">) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const index = useReferenceIndex();
  if (index.status !== "ready") return <p className="p-4 text-sm text-subtle" role={index.status === "error" ? "alert" : "status"}>{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const summary = index.data.entries.find((entry) => entry.id === target.id && entry.category === target.category);
  if (!summary) return <p role="alert" className="p-4 text-sm text-subtle">{t("reference.error")}</p>;
  if (target.category === "activities") {
    const family = groupActivities(index.data.entries.filter((entry) => entry.category === "activities"), target.id)
      .find((entry) => entry.variants.some((variant) => variant.id === summary.id))!;
    return <ActivityDetail family={family} current={summary}
      onSelect={(id) => openReference({ category: "activities", id, name: family.name })} onOpenMap={onOpenMap} />;
  }
  return target.category === "recipes" ? <MapRecipePanel summary={summary} onOpenMap={onOpenMap} />
    : <ReferenceDetail summary={summary} onOpenMap={onOpenMap} />;
};

const MapReferencePanel = ({ target, backLabel, openedFromDungeon = false, onBack, onClose, onOpenMap }: Props) => {
  const { t } = useTranslation();
  const dungeonTarget = target.category === "dungeons" && !target.group;
  const index = useReferenceIndex(isDungeonQuestTarget(target) || dungeonTarget);
  const dungeonSummary = index.status === "ready"
    ? index.data.entries.find((entry) => entry.category === "dungeons" && entry.id === target.id) : undefined;
  const dungeonEntry = useReferenceEntry(isDungeonQuestTarget(target) || dungeonTarget ? dungeonSummary : undefined);
  const dungeonLocation = dungeonEntry.status === "ready"
    ? dungeonEntry.data.locations.find((location) => hasMapDefinition(location.mapId)) : undefined;
  const showingDungeonMarker = dungeonTarget;
  const backText = showingDungeonMarker
    ? t("mapInteriors.backToMarker", { name: getItemDisplayName(backLabel) })
    : t("reference.backTo", { label: getItemDisplayName(backLabel) });
  return <>
    <header className={cn("flex shrink-0 items-center gap-2 px-4", showingDungeonMarker
      ? "border-b border-border py-3"
      : target.category === "items" ? "border-b border-border bg-black/20 py-2" : "pt-3")}>
      <button type="button" onClick={onBack} title={backText} aria-label={backText}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white">
        <ChevronLeft size={15} className="shrink-0" aria-hidden="true" /><span className="truncate">{backText}</span>
      </button>
      {(target.category !== "items" || NATIVE_WIKI_CATEGORIES.has(target.category)) && !showingDungeonMarker && <button type="button" onClick={onClose} title={t("chrome.close")} aria-label={t("chrome.close")}
        className="ml-auto grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-white/5 hover:text-white"><X size={16} aria-hidden="true" /></button>}
    </header>
    <div key={`${target.category}:${target.id}:${target.group ?? ""}`} className="flex min-h-0 flex-1 flex-col">
      {NATIVE_WIKI_CATEGORIES.has(target.category) ? <NativeWikiDetail id={target.id} onOpenMap={onOpenMap} compact />
        : target.category === "items" ? <MapItemPanel itemId={target.id} initialTab={target.initialItemTab} reward={target} onOpenMap={onOpenMap} onClose={onClose} />
        : target.category === "spells" ? <MapSpellPanel spellId={target.id} />
        : isDungeonBossTarget(target) ? <DungeonBossDetailPanel target={target} />
        : isDungeonQuestTarget(target) ? <DungeonQuestDetailPanel target={target} dungeonName={dungeonSummary?.name}
          dungeonLocation={dungeonLocation} openedFromDungeon={openedFromDungeon} onOpenMap={onOpenMap} />
        : isDungeonNpcTarget(target) ? <DungeonNpcDetailPanel target={target} onOpenMap={onOpenMap} />
        : dungeonTarget ? dungeonLocation
          ? <MapDungeonReferencePanel location={dungeonLocation} onOpenMap={onOpenMap} onClose={onClose} />
          : index.status === "loading" || dungeonEntry.status === "loading"
            ? <p className="p-4 text-sm text-subtle" role="status">{t("reference.loading")}</p>
            : <EntryPanel target={target} onOpenMap={onOpenMap} />
        : target.category === "creatures" ? <CreatureDetail target={target} onOpenMap={onOpenMap} />
        : target.category === "boxes" ? <MapRewardBoxPanel target={target} onOpenMap={onOpenMap} />
          : <EntryPanel target={target} onOpenMap={onOpenMap} />}
    </div>
  </>;
};

export default MapReferencePanel;
