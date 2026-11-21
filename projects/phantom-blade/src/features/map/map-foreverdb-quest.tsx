import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { useQuestText } from "../../i18n/quest-text";
import { contentUrl } from "../../lib/content-url";
import { useItemCatalog } from "../database/use-item-catalog";
import ItemIcon from "../database/item-icon";
import { loadDungeonQuests, type DungeonQuest } from "../reference/dungeon-quest-data";
import { isLinkedQuestOfferPoint } from "./map-quest-filter";
import QuestDetailsSections from "../reference/quest-details-sections";
import QuestRewardDetails from "../reference/quest-reward-details";
import { hasQuestRewards, type QuestRewardData } from "../reference/quest-reward-utils";
import MapQuestSteps from "./map-quest-steps";
import type { MapPoint, MapQuestInfo } from "./types";

interface QuestRecord {
  id: string;
  title: string;
  level?: number;
  minimumLevel?: number;
  faction?: "Alliance" | "Horde" | "Neutral" | "Both";
  objective?: string;
  description?: string;
  progressText?: string;
  completionText?: string;
  objectiveItem?: { id: string; name: string; quality: "Common" | "Uncommon"; quantity: number };
  objectiveItems?: { id: string; name: string; quantity: number; icon?: string }[];
  startsAt?: string;
  endsAt?: string;
  requiredReputation?: string;
  rewards?: { id: string; name: string; quantity?: number }[];
  rewardChoices?: { id: string; name: string; quantity?: number; icon?: string }[];
  rewardItems?: { id: string; name: string; quantity?: number; icon?: string }[];
  rewardChoice?: boolean;
  reward?: string;
  currencyRewards?: { id: string; name: string; quantity: number; icon: string }[];
  experience?: number;
  money?: string;
  reputation?: string[];
}

interface QuestCatalog {
  version: 1;
  quests: Record<string, QuestRecord>;
  markerQuestIds: Record<string, string>;
  markerDungeonQuests?: Record<string, { dungeonId: string; id: string }>;
}

const updatedQuestIds = new Set(["434", "466", "932", "963", "984", "1045", "6001", "99108", "94414"]);

let catalogRequest: Promise<QuestCatalog> | undefined;
function loadCatalog(): Promise<QuestCatalog> {
  catalogRequest ??= (async () => {
    const response = await fetch(contentUrl("data/quests/quest-details.json"));
    if (!response.ok) throw new Error(`Quest data: HTTP ${response.status}`);
    const data: QuestCatalog = await response.json();
    if (data.version !== 1 || !data.quests || !data.markerQuestIds) throw new Error("Invalid quest data");
    return data;
  })()
    .catch((error: unknown) => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}

interface MapForeverdbQuestProps {
  markerId: string;
  offeredQuestId?: string;
  offeredQuestLevel?: number;
  questGiverName?: string;
  questGiverMarkerId?: string;
  currentGiverMarkerId?: string;
  showSectionHeading?: boolean;
  showNavigateToQuest?: boolean;
  mapId: string;
  mapPoints: MapPoint[];
  questName: string;
  questInfo?: MapQuestInfo;
  dungeonIds?: string[];
  questNpcName?: string;
  existingDescription?: string;
  onOpenMap: (mapId: string, markerId: string) => void;
}

export default function MapForeverdbQuest({ markerId, offeredQuestId, offeredQuestLevel, questGiverName, questGiverMarkerId,
  currentGiverMarkerId, showSectionHeading = true,
  mapId, mapPoints, questName, questInfo, dungeonIds, questNpcName,
  existingDescription, onOpenMap, showNavigateToQuest = false }: MapForeverdbQuestProps) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const questText = useQuestText();
  const itemCatalog = useItemCatalog();
  const itemById = useMemo(() => new Map(itemCatalog.status === "ready"
    ? itemCatalog.catalog.items.map((item) => [item.id, item]) : []), [itemCatalog]);
  const [catalog, setCatalog] = useState<QuestCatalog>();
  const [dungeonMatch, setDungeonMatch] = useState<{ key: string; quest?: DungeonQuest }>();
  const questId = offeredQuestId ?? catalog?.markerQuestIds[markerId];
  const quest = questId ? catalog?.quests[questId] : undefined;
  const giverPoint = questGiverMarkerId ? mapPoints.find((point) => point.id === questGiverMarkerId) : undefined;
  const localizedGiver = (name?: string) => {
    if (!name) return name;
    if (giverPoint && (name === giverPoint.name
      || "sourceName" in giverPoint && name === giverPoint.sourceName)) return giverPoint.name;
    const matches = new Set(mapPoints.filter((point) => "entityId" in point && point.entityId
      && "sourceName" in point && point.sourceName === name).map((point) => point.name));
    return matches.size === 1 ? [...matches][0] : name;
  };
  const matchingTitle = quest?.title ?? questName;
  const linkedDungeonQuest = catalog?.markerDungeonQuests?.[markerId];
  const dungeonKey = [...new Set([linkedDungeonQuest?.dungeonId, ...(dungeonIds ?? [])].filter((id): id is string => !!id))].join("|");
  const matchKey = `${markerId}|${dungeonKey}|${linkedDungeonQuest?.id ?? ""}|${matchingTitle}|${questNpcName ?? ""}`;
  const dungeonQuest = dungeonMatch?.key === matchKey ? dungeonMatch.quest : undefined;

  useEffect(() => {
    let active = true;
    loadCatalog().then((data) => { if (active) setCatalog(data); })
      .catch((error: unknown) => console.error("Failed to load quest data", error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const ids = dungeonKey.split("|").filter(Boolean);
    if (ids.length) {
      void Promise.allSettled(ids.map(loadDungeonQuests)).then((results) => {
        if (!active) return;
        const matches = results.flatMap((result) => result.status === "fulfilled"
          ? result.value.quests.filter((entry) => linkedDungeonQuest
            ? entry.id === linkedDungeonQuest.id
            : entry.title.toLowerCase() === matchingTitle.toLowerCase()
              && (!questNpcName || entry.giver?.name === questNpcName || entry.turnIn?.name === questNpcName))
          : []);
        setDungeonMatch({ key: matchKey, quest: matches.length === 1 ? matches[0] : undefined });
      });
    }
    return () => { active = false; };
  }, [dungeonKey, linkedDungeonQuest, matchKey, matchingTitle, questNpcName]);

  const originalObjective = dungeonQuest?.objective ?? quest?.objective;
  const objective = (originalObjective && questText(questId, "objective", originalObjective))
    ?? (quest?.objectiveItem && t("map.foreverQuest.deliverItem", {
      count: quest.objectiveItem.quantity,
      item: gameText(quest.objectiveItem.name, `ItemSparse:${quest.objectiveItem.id}:4`),
      recipient: localizedGiver(quest.endsAt) ?? questGiverName ?? "",
    }));
  const redundantTurnIn = Boolean(objective && /^Turn in to\b/i.test(existingDescription?.trim() ?? ""));
  const description = existingDescription && !redundantTurnIn && (
    <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{existingDescription}</p>
  );
  if (!questInfo && !quest && !dungeonQuest && !questGiverName) return description ?? null;
  const startsAt = questInfo?.startsAtKey ? t(questInfo.startsAtKey)
    : localizedGiver(dungeonQuest?.giver?.name ?? quest?.startsAt) ?? questGiverName;
  const endsAt = questInfo?.endsAtKey ? t(questInfo.endsAtKey)
    : localizedGiver(dungeonQuest?.turnIn?.name ?? quest?.endsAt);
  const factionName = quest?.faction ?? questInfo?.faction ?? dungeonQuest?.faction;
  const faction = factionName ? t(`map.foreverQuest.factions.${factionName}`) : undefined;
  const requiredLevel = questInfo?.requiredLevel ?? dungeonQuest?.minimumLevel ?? quest?.minimumLevel;
  const questLevel = dungeonQuest?.level ?? quest?.level ?? offeredQuestLevel;
  const requiredClass = questInfo?.requiredClassKey ? t(questInfo.requiredClassKey) : undefined;
  const requiredProfession = questInfo?.requiredProfessionKey ? t(questInfo.requiredProfessionKey) : undefined;
  const observedChoices = dungeonQuest?.rewardChoices ?? [];
  const observedItems = dungeonQuest?.rewardItems ?? [];
  const hasObservedItems = observedChoices.length + observedItems.length > 0;
  const rewardChoices = hasObservedItems ? observedChoices : quest?.rewardChoices
    ?? (quest?.rewardChoice ? quest.rewards ?? [] : []);
  const rewardItems = hasObservedItems ? observedItems : quest?.rewardItems
    ?? (quest?.rewardChoice ? [] : quest?.rewards ?? []);
  const rewardData: QuestRewardData = {
    rewardChoices,
    rewardItems,
    currencyRewards: quest?.currencyRewards,
    reward: hasObservedItems ? undefined : dungeonQuest?.reward ?? quest?.reward,
    experience: dungeonQuest?.experience ?? quest?.experience,
    money: dungeonQuest?.money ?? quest?.money,
    reputation: dungeonQuest?.reputation ?? quest?.reputation,
  };
  const availableIds = new Set(mapPoints.map((point) => point.id));
  const questMarkers = Object.fromEntries([
    ...Object.entries(catalog?.markerQuestIds ?? {}).map(([id, linkedQuestId]) => [linkedQuestId, id]),
    ...Object.entries(catalog?.markerDungeonQuests ?? {}).map(([id, linkedQuest]) => [linkedQuest.id, id]),
    ...mapPoints.flatMap((point) => "questOffers" in point
      ? (point.questOffers ?? []).map((offer) => [offer.id, point.id]) : []),
    ...mapPoints.flatMap((point) => "questId" in point && point.questId && !isLinkedQuestOfferPoint(point)
      ? [[point.questId, point.id]] : []),
  ].filter(([, id]) => availableIds.has(id)));
  const stepQuestId = offeredQuestId ?? questId ?? linkedDungeonQuest?.id;

  return <><QuestDetailsSections questId={questId ?? linkedDungeonQuest?.id} showHeading={showSectionHeading}
    requiredLevel={requiredLevel} questLevel={questLevel} faction={faction}
    requiredClass={requiredClass} requiredProfession={requiredProfession}
    requiredReputation={quest?.requiredReputation}
    description={questText(questId, "description", quest?.description)} progressText={quest?.progressText}
    completionText={quest?.completionText}
    updateNote={questId && updatedQuestIds.has(questId) ? t(`map.foreverQuest.updateNotes.${questId}`) : undefined}
    objective={objective} objectiveSupplement={quest?.objectiveItem || quest?.objectiveItems?.length || description ? <>
      {quest?.objectiveItem && <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] bg-white/[0.03] px-2 py-1.5">
        <ItemIcon icon={itemById.get(quest.objectiveItem.id)?.icon}
          name={gameText(quest.objectiveItem.name, `ItemSparse:${quest.objectiveItem.id}:4`)} size={24} />
        <span className="min-w-0 flex-1 text-[12px] text-zinc-100">{gameText(quest.objectiveItem.name, `ItemSparse:${quest.objectiveItem.id}:4`)}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-subtle">×{quest.objectiveItem.quantity}</span>
      </div>}
      {quest?.objectiveItems?.map((item) => <div key={item.id}
        className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] bg-white/[0.03] px-2 py-1.5">
        <ItemIcon icon={item.icon ?? itemById.get(item.id)?.icon}
          name={gameText(item.name, `ItemSparse:${item.id}:4`)} size={24} />
        <span className="min-w-0 flex-1 text-[12px] text-zinc-100">{gameText(item.name, `ItemSparse:${item.id}:4`)}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-subtle">×{item.quantity}</span>
      </div>)}
      {description}
    </> : undefined}
    startsWith={startsAt} turnInTo={endsAt}
    rewards={hasQuestRewards(rewardData) && <QuestRewardDetails quest={rewardData} itemById={itemById} />} />
    {showNavigateToQuest && !currentGiverMarkerId && questGiverMarkerId && <button type="button"
      onClick={() => onOpenMap(mapId, questGiverMarkerId)}
      className="mt-4 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-3 py-3 text-left text-[13px] font-medium text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-accent">
      <MapPin size={15} className="shrink-0 text-zinc-400" aria-hidden="true" />
      <span>{t("map.foreverQuest.navigateToQuest")}</span>
    </button>}
    {stepQuestId && <MapQuestSteps questId={stepQuestId} markerId={markerId} mapId={mapId}
      mapPoints={mapPoints} pickupName={startsAt} handInName={endsAt} questObjective={quest?.objective}
      questMarkers={questMarkers} onOpenMap={onOpenMap} />}
  </>;
}
