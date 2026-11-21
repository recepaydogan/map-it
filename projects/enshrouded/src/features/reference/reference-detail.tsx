import { getItemDisplayName } from "../../lib/item-display-name";
import ScheduleDetailPanel from "./schedule-detail-panel";
import { scheduleActivities } from "./schedule-activities";
import ReferenceBackLink from "./reference-back-link";
import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import CreatureIcon from "./creature-icon";
import DungeonDetailPanel from "./dungeon-detail-panel";
import QuestDetailPanel from "./quest-detail-panel";
import { adventureKind, adventureVariant } from "./adventure-presentation";
import EquipmentSetPanel from "./equipment-set-panel";
import CompanionDetailPanel from "./companion-detail-panel";
import ReferenceOverview from "./reference-overview";
import ReferenceSections from "./reference-sections";
import RecipeReferenceSections from "../database/recipe-reference-sections";
import CreatureContent from "./creature-content";
import FieldEventEntranceContent from "./field-event-entrance-content";
import ReferenceLocations from "./reference-locations";
import ReferenceMapLinks from "./reference-map-links";
import TravelDetails from "./travel-details";
import { travelGroupKey } from "./travel-presentation";
import type { ReferenceSummary } from "./reference-types";
import { useReferenceEntry } from "./use-reference-data";
import TitleDetails from "../intelligence/title-details";
import { collectionObjectiveSections } from "./collection-objective-items";
import { COLLECTIBLE_PROGRESSION } from "../../game-config";
import CollectibleProgressionPanel from "./collectible-progression-panel";
import AchievementDetailPanel from "./achievement-detail-panel";
import { creatureCategoryKey, getCreatureLevel } from "./creature-heading";
import { getCategoryConfig } from "../map/map-config";
import MapPointIcon from "../map/map-point-icon";

const ReferenceDetail = ({ summary, onOpenMap, backLabel, onBack }: { backLabel?: string; onBack?: () => void; summary: ReferenceSummary; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const entry = state.data;
  const isDungeon = entry.category === "dungeons";
  const isQuest = entry.category === "quests";
  const isAchievement = entry.category === "achievements";
  const isSet = entry.category === "sets";
  const isCollectible = entry.category === "progression" && entry.group === COLLECTIBLE_PROGRESSION.referenceGroup;
  const isEventSchedule = entry.category === "schedules" && entry.id.startsWith("EventSchedule:");
  const scheduleLinks = isEventSchedule ? scheduleActivities(entry) : [];
  const scheduleNames = [...new Set(scheduleLinks.map(link => link.name))];
  const displayName = isEventSchedule ? (scheduleNames.length === 1 ? scheduleNames[0]! : t("reference.schedule.title")) : entry.name;
  const sections = entry.category === "gathering"
    ? entry.sections.filter((section) => section.title !== "reference.labels.gathering-results")
    : entry.category === "titles"
      ? entry.sections.filter((section) => !["reference.labels.collection-bonuses", "reference.labels.equipped-bonuses", "reference.labels.unlock-items"].includes(section.title))
      : collectionObjectiveSections(entry).filter((section) => entry.category !== "recipes" || ![
        "reference.labels.mastery-success-rates",
        "reference.labels.success-and-alternatives",
      ].includes(section.title));
  const icon = isDungeon ? undefined : entry.icon ?? (isEventSchedule ? scheduleLinks[0]?.icon : undefined) ?? (isSet ? entry.sections.find((section) => section.title === "reference.labels.set-pieces")?.links?.[0]?.icon : undefined);
  const dungeonIcon = isDungeon ? getCategoryConfig("dungeon") : undefined;
  const creatureLevel = entry.category === "creatures" ? getCreatureLevel(entry) : undefined;
  let categoryLabel = t(`reference.categories.${entry.category}`);
  if (entry.fieldEvent) categoryLabel = t("map.fieldEvent.entrance");
  else if (entry.category === "creatures") categoryLabel = t(creatureCategoryKey(entry));
  else if (entry.groupKey) categoryLabel = t(entry.groupKey);
  else if (!isSet && entry.group && !["All", "None"].includes(entry.group)
    && (!isAchievement || entry.group !== entry.name)) {
    if (entry.adventure) categoryLabel = adventureKind(entry, t);
    else if (entry.travel) categoryLabel = t(travelGroupKey(entry.group) ?? entry.group);
    else categoryLabel = gameText(entry.group);
  }
  return <article className={cn("h-full min-h-0 min-w-0 text-left", isDungeon || isQuest ? "flex flex-col" : "overflow-y-auto scroll-slim")}>
    <header className={cn("relative shrink-0 overflow-hidden border-b border-border", isAchievement ? "px-4 py-3 sm:px-6" : "px-6 py-5")} style={{ background: "radial-gradient(ellipse at top left, rgba(212,175,55,.09), transparent 70%)" }}>
      <div className="ml-0 mr-auto max-w-[760px]"><ReferenceBackLink label={backLabel} onBack={onBack} /></div>
      <div className="relative ml-0 mr-auto flex max-w-[760px] items-center gap-4">
        <div className={cn("grid shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/20 bg-black/20 shadow-inner", isAchievement ? "h-12 w-12" : "h-[72px] w-[72px]")}>{entry.category === "creatures" ? <CreatureIcon icon={icon} name={getItemDisplayName(gameText(displayName))} size={isAchievement ? 40 : 60} /> : isDungeon && dungeonIcon ? <MapPointIcon fallback={dungeonIcon.icon} source={dungeonIcon.nativeIconPath} size={48} /> : icon ? <ItemIcon icon={icon} name={getItemDisplayName(gameText(displayName))} size={isAchievement ? 40 : 60} /> : <BookOpen size={isAchievement ? 22 : 28} className="text-accent/70" aria-hidden="true" />}</div>
        <div className="min-w-0"><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{categoryLabel}{creatureLevel !== undefined && ` · ${t("reference.adventure.level", { number: creatureLevel })}`}</p><h2 className={cn("font-display leading-tight font-semibold text-white", isAchievement ? "text-[18px]" : "text-[22px]")}>{getItemDisplayName(gameText(displayName))}</h2>{entry.adventure ? <p className="mt-2 text-xs text-subtle">{adventureVariant(entry, t)}</p> : entry.subtitleKey && <p className="mt-2 text-xs text-subtle">{t(entry.subtitleKey)}</p>}</div>
      </div>
    </header>
    {isQuest ? <QuestDetailPanel entry={entry} onOpenMap={onOpenMap} /> : isDungeon ? <DungeonDetailPanel entry={entry} onOpenMap={onOpenMap} /> : isAchievement ? <AchievementDetailPanel entry={entry} onOpenMap={onOpenMap} /> : <div className="ml-0 mr-auto max-w-[808px] space-y-7 px-6 py-6">
      {isCollectible ? <CollectibleProgressionPanel referenceId={entry.id} onOpenMap={onOpenMap} /> : isEventSchedule ? <ScheduleDetailPanel entry={entry} /> : entry.fieldEvent ? <><FieldEventEntranceContent npcId={entry.id.slice("NpcData:".length)} activityId={entry.fieldEvent.activityId} onOpenMap={onOpenMap} />
        {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}</> : entry.category === "creatures" ? <CreatureContent entry={entry} showLocations onOpenMap={onOpenMap} />
        : entry.category === "mounts" ? <CompanionDetailPanel entry={entry} onOpenMap={onOpenMap} />
        : entry.category === "travel" ? <TravelDetails entry={entry} onOpenMap={onOpenMap} /> : <>
        <ReferenceOverview entry={entry} onOpenMap={onOpenMap} />
        {entry.category === "titles" && <TitleDetails id={entry.id} />}
        {isSet ? <EquipmentSetPanel entry={entry} /> : entry.category === "recipes"
          ? <RecipeReferenceSections entry={entry} sections={sections} /> : <ReferenceSections sections={sections} />}
        {!!entry.mapLinks?.length && <ReferenceMapLinks groups={entry.mapLinks} onOpenMap={onOpenMap} />}
      </>}
    </div>}
  </article>;
};
export default ReferenceDetail;
