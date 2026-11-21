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
import ReferenceOverview, { REFERENCE_FIRST_COLUMN_CLASS } from "./reference-overview";
import ReferenceSections from "./reference-sections";
import RecipeReferenceSections from "../database/recipe-reference-sections";
import CreatureContent from "./creature-content";
import type { MapReferenceSearch } from "../map/map-focus-request";
import FieldEventEntranceContent from "./field-event-entrance-content";
import ReferenceLocations from "./reference-locations";
import TravelDetails from "./travel-details";
import { travelGroupKey } from "./travel-presentation";
import type { ReferenceSummary } from "./reference-types";
import { useReferenceEntry } from "./use-reference-data";
import TitleDetails from "../intelligence/title-details";
import { collectionObjectiveSections } from "./collection-objective-items";
import { COLLECTIBLE_PROGRESSION, TITLE_ICON } from "../../game-config";
import CollectibleProgressionPanel from "./collectible-progression-panel";
import AchievementDetailPanel from "./achievement-detail-panel";
import { creatureCategoryKey, getCreatureLevel, isQuestNpc } from "./creature-heading";
import { questDisplayName } from "./quest-presentation";
import { getCategoryConfig } from "../map/map-config";
import MapPointIcon from "../map/map-point-icon";
import WingUnlockSources from "./wing-unlock-sources";

const ReferenceDetail = ({ summary, onOpenMap, backLabel, onBack }: { backLabel?: string; onBack?: () => void; summary: ReferenceSummary; onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void }) => {
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
  const displayName = isEventSchedule ? (scheduleNames.length === 1 ? scheduleNames[0]! : t("reference.schedule.title")) : isQuest ? questDisplayName(entry, t, gameText) : entry.name;
  const sections = entry.category === "gathering"
    ? entry.sections.filter((section) => section.title !== "reference.labels.gathering-results")
    : entry.category === "titles"
      ? entry.sections.filter((section) => !["reference.labels.collection-bonuses", "reference.labels.equipped-bonuses", "reference.labels.unlock-items"].includes(section.title))
      : collectionObjectiveSections(entry).filter((section) => (entry.category !== "wings" || section.title !== "reference.labels.owned-effects" || Boolean(section.facts?.length)) && (entry.category !== "recipes" || ![
        "reference.labels.mastery-success-rates",
        "reference.labels.success-and-alternatives",
      ].includes(section.title)));
  const wingBonusSections = entry.category === "wings"
    ? sections.filter((section) => ["reference.labels.equipped-bonuses", "reference.labels.owned-effects"].includes(section.title))
    : [];
  const remainingSections = entry.category === "wings"
    ? sections.filter((section) => !wingBonusSections.includes(section))
    : sections;
  const wingUnlockSection = entry.category === "wings"
    ? remainingSections.find((section) => section.title === "reference.labels.unlock-items")
    : undefined;
  const icon = entry.icon ?? (isEventSchedule ? scheduleLinks[0]?.icon : undefined) ?? (isSet ? entry.sections.find((section) => section.title === "reference.labels.set-pieces")?.links?.[0]?.icon : undefined)
    ?? (entry.category === "wings" ? entry.sections.find((section) => section.title === "reference.labels.unlock-items")?.links?.[0]?.icon : undefined);
  const creatureLevel = entry.category === "creatures" ? getCreatureLevel(entry) : undefined;
  const questNpcCategory = isQuestNpc(entry) ? getCategoryConfig("quest-npc") : null;
  let categoryLabel = t(`reference.categories.${entry.category}`);
  if (entry.fieldEvent) categoryLabel = t("map.fieldEvent.entrance");
  else if (entry.category === "creatures") categoryLabel = t(creatureCategoryKey(entry));
  else if (!isSet && entry.group && !["All", "None"].includes(entry.group)
    && (!isAchievement || entry.group !== entry.name)) {
    if (entry.adventure) categoryLabel = adventureKind(entry, t);
    else if (entry.travel) categoryLabel = t(travelGroupKey(entry.group) ?? entry.group);
    else categoryLabel = gameText(entry.group);
  }
  return <article className={cn("h-full min-h-0 min-w-0 text-left", isDungeon || isQuest ? "flex flex-col" : "overflow-y-auto scroll-slim")}>
    <header className={cn("relative shrink-0 overflow-hidden border-b border-border bg-surface", isAchievement ? "px-4 py-3 sm:px-6" : "px-6 py-5")}>
      <div className="ml-0 mr-auto max-w-[760px]"><ReferenceBackLink label={backLabel} onBack={onBack} /></div>
      <div className="relative ml-0 mr-auto flex max-w-[760px] items-center gap-4">
        <div className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-accent/20 bg-black/20 shadow-inner", isAchievement ? "h-12 w-12" : "h-[72px] w-[72px]")}>{questNpcCategory ? <MapPointIcon fallback={questNpcCategory.icon} source={questNpcCategory.nativeIconPath} size={60} /> : entry.category === "creatures" ? <CreatureIcon icon={icon} name={getItemDisplayName(displayName, gameText(displayName))} size={isAchievement ? 40 : 60} /> : entry.category === "titles" ? <ItemIcon icon={TITLE_ICON} name={getItemDisplayName(displayName, gameText(displayName))} size={60} /> : icon ? <ItemIcon icon={icon} name={getItemDisplayName(displayName, gameText(displayName))} size={isAchievement ? 40 : 60} /> : <BookOpen size={isAchievement ? 22 : 28} className="text-accent/70" aria-hidden="true" />}</div>
        <div className="min-w-0"><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{categoryLabel}{creatureLevel !== undefined && ` · ${t("reference.adventure.level", { number: creatureLevel })}`}</p><h2 className={cn("font-display leading-tight font-semibold text-white", isAchievement ? "text-[18px]" : "text-[22px]")}>{getItemDisplayName(displayName, gameText(displayName))}</h2>{entry.adventure && <p className="mt-2 text-xs text-subtle">{adventureVariant(entry, t)}</p>}</div>
      </div>
    </header>
    {isQuest ? <QuestDetailPanel entry={entry} onOpenMap={onOpenMap} /> : isDungeon ? <DungeonDetailPanel entry={entry} onOpenMap={onOpenMap} /> : isAchievement ? <AchievementDetailPanel entry={entry} onOpenMap={onOpenMap} /> : <div className="ml-0 mr-auto max-w-[808px] space-y-7 px-6 py-6">
      {isCollectible ? <CollectibleProgressionPanel referenceId={entry.id} onOpenMap={onOpenMap} /> : isEventSchedule ? <ScheduleDetailPanel entry={entry} /> : entry.fieldEvent ? <><FieldEventEntranceContent npcId={entry.id.slice("NpcData:".length)} activityId={entry.fieldEvent.activityId} onOpenMap={onOpenMap} />
        {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} creature={entry.category === "creatures" ? { id: entry.id, name: entry.name } : undefined} />}</> : entry.category === "creatures" ? <CreatureContent entry={entry} showLocations onOpenMap={onOpenMap} />
        : entry.category === "mounts" ? <CompanionDetailPanel entry={entry} onOpenMap={onOpenMap} />
        : entry.category === "travel" ? <TravelDetails entry={entry} onOpenMap={onOpenMap} /> : <>
        {entry.category === "wings" ? <div className="@container">
          <div className="grid grid-cols-1 gap-5 @min-[500px]:grid-cols-2 @min-[740px]:grid-cols-3">
            <div className="w-full max-w-[240px] @min-[500px]:col-span-2 @min-[740px]:col-span-1"><ReferenceOverview entry={entry} onOpenMap={onOpenMap} /></div>
            {wingBonusSections.map((section) => <div key={section.title} className="w-full max-w-[240px]"><ReferenceSections sections={[section]} /></div>)}
          </div>
          {!wingBonusSections.some((section) => section.facts?.length) && <p className="mt-4 text-xs text-subtle">{t("wings.noStatBonusInClient")}</p>}
        </div> : entry.category === "titles" ? <div className="@container space-y-7">
          <ReferenceOverview entry={entry} onOpenMap={onOpenMap} detailsClassName={REFERENCE_FIRST_COLUMN_CLASS} />
          <TitleDetails id={entry.id} className={REFERENCE_FIRST_COLUMN_CLASS} />
        </div> : <ReferenceOverview entry={entry} onOpenMap={onOpenMap} />}
        {isSet ? <EquipmentSetPanel entry={entry} /> : entry.category === "recipes"
          ? <RecipeReferenceSections entry={entry} sections={sections} /> : wingUnlockSection?.links?.length
            ? <><WingUnlockSources items={wingUnlockSection.links} onOpenMap={onOpenMap} />
              <ReferenceSections sections={remainingSections.filter((section) => section !== wingUnlockSection)} /></>
            : <ReferenceSections sections={remainingSections} />}
      </>}
    </div>}
  </article>;
};
export default ReferenceDetail;
