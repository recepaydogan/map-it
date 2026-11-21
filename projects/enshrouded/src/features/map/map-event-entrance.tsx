import { contentUrl } from "../../lib/content-url";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock3 } from "lucide-react";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import SchedulePreview from "../events/schedule-preview";
import ActivityOverview from "../reference/activity-overview";
import { adventureFacts } from "../reference/adventure-presentation";
import DungeonCreatureList from "../reference/dungeon-creature-list";
import DungeonInteriorLinks from "../reference/dungeon-interior-links";
import EventAreaLink from "../reference/event-area-link";
import ReferenceFactBadges from "../reference/reference-fact-badges";
import { ReferenceLinks } from "../reference/reference-sections";
import { useReferenceEntries, useReferenceIndex } from "../reference/use-reference-data";
import type { ReferenceSummary } from "../reference/reference-types";
import { useEventEntrance, type EventEntrance } from "./use-event-entrances";
import MapEventEntranceRewards from "./map-event-entrance-rewards";
import { hasMapDefinition } from "./map-registry";

const ENTRY_FACTS = new Set([
  "reference.labels.minimum-party-size", "reference.labels.maximum-party-size",
  "reference.labels.minimum-level", "reference.labels.maximum-level",
]);

function EventEntranceSchedule({ entrance }: { entrance: EventEntrance }) {
  const { t, i18n } = useTranslation();
  const starts = [...new Set(entrance.starts)].sort();
  const hourly = starts.length === 24 && starts.every((start, hour) =>
    Number(start.slice(0, 2)) === hour && start.slice(3) === starts[0]?.slice(3));
  const weekdays = entrance.days.length === 7 ? t("reference.schedule.everyDay") : entrance.days.length
    ? entrance.days.map((day) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(2024, 0, 7 + day)))).join(" · ")
    : t("reference.schedule.noDays");
  const times = hourly
    ? t(starts[0]!.endsWith(":00") ? "reference.schedule.hourly" : "reference.schedule.hourlyMinute", { minute: starts[0]!.slice(3) })
    : starts.join(" · ") || t("reference.schedule.noTimes");
  return <section>
    <DatabaseSectionTitle>{t("reference.schedule.title")}</DatabaseSectionTitle>
    <div className="scroll-slim flex items-center gap-3 overflow-x-auto whitespace-nowrap rounded-[var(--radius-md)] border border-accent/20 bg-surface px-3 py-3 text-[12px]">
      <span className="flex shrink-0 items-center gap-1.5 text-zinc-200"><CalendarDays size={14} className="text-accent" aria-hidden="true" />{weekdays}</span>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums text-zinc-100"><Clock3 size={14} className="text-accent" aria-hidden="true" />{times}</span>
    </div>
    <div className="mt-2"><SchedulePreview days={entrance.days} minutes={starts.map((start) =>
      Number(start.slice(0, 2)) * 60 + Number(start.slice(3)))} /></div>
  </section>;
}

const MapEventEntrance = ({ npcId, markerId, onOpenMap, withDivider = true, expectedEventId, showArtwork = true }: {
  npcId?: string; markerId?: string; onOpenMap?: (mapId: string, markerId: string) => void;
  withDivider?: boolean; expectedEventId?: string; showArtwork?: boolean;
}) => {
  const { t } = useTranslation();
  const entrance = useEventEntrance(npcId, markerId);
  const index = useReferenceIndex();
  const summaries = useMemo(() => new Map(index.status === "ready"
    ? index.data.entries.map((entry) => [entry.id, entry]) : []), [index]);
  const detail = entrance.status === "ready" ? entrance.data : undefined;
  const eventSummary = detail ? summaries.get(detail.eventId) : undefined;
  const destinationSummary = detail?.destinationId ? summaries.get(detail.destinationId) : undefined;
  const selectedSummaries = [eventSummary, destinationSummary]
    .filter((summary): summary is ReferenceSummary => !!summary);
  const entries = useReferenceEntries(selectedSummaries);

  if (entrance.status === "error" || index.status === "error" || entries.status === "error"
    || (detail && expectedEventId && detail.eventId !== expectedEventId)
    || (detail && index.status === "ready" && (!eventSummary || (detail.destinationId && !destinationSummary)))) {
    return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  }
  if (entrance.status !== "ready" || index.status !== "ready" || entries.status !== "ready" || !detail || !eventSummary) {
    return <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>;
  }

  const destination = detail.destinationId
    ? entries.data.find((entry) => entry.id === detail.destinationId) : undefined;
  const eventArea = destinationSummary ? destination?.eventArea : detail.eventArea;
  const interiorTargets = destination?.interiorMaps ?? destination?.relatedInteriorMaps ?? detail.relatedInteriorMaps;
  const relatedInterior = !destination?.interiorMaps && !!interiorTargets;
  const event = entries.data.find((entry) => entry.id === detail.eventId)!;
  const overview = event.sections.filter((section) => !["reference.labels.schedule", "reference.labels.possible-rewards"].includes(section.title));
  const rewards = event.sections.filter((section) => section.title === "reference.labels.possible-rewards");
  const entryFacts = destination ? adventureFacts([
    ...destination.facts,
    ...destination.sections.filter((section) => section.title === "reference.labels.entry-requirements")
      .flatMap((section) => section.facts ?? []),
  ], t).filter((fact) => ENTRY_FACTS.has(fact.label)) : [];
  const bosses = destination?.sections.filter((section) =>
    ["reference.labels.bosses", "reference.labels.boss"].includes(section.title))
    .flatMap((section) => section.links ?? []) ?? [];
  const bossLocations = entrance.bossLocations;
  const mapLinkIds = bossLocations && onOpenMap ? new Set(Object.entries(bossLocations)
    .filter(([, location]) => hasMapDefinition(location.mapId)).map(([id]) => id)) : undefined;

  return <div className={cn("space-y-6", withDivider && "mt-4 border-t border-border pt-4")}>
    <ReferenceFactBadges facts={entryFacts} layout="grid" />
    {showArtwork && event.icon && <img src={contentUrl(`${event.icon}`)} alt=""
      className="aspect-[16/9] w-full rounded-[var(--radius-md)] border border-border object-cover object-top" />}
    <EventEntranceSchedule entrance={detail} />
    {!destinationSummary && !!interiorTargets?.length && onOpenMap && <DungeonInteriorLinks targets={interiorTargets}
      labelKey={relatedInterior ? "mapInteriors.openRelatedInterior" : undefined} onOpenMap={onOpenMap} />}
    {!destinationSummary && eventArea && onOpenMap && <EventAreaLink target={eventArea} onOpenMap={onOpenMap} />}
    {destinationSummary && <section className="space-y-3">
      <DatabaseSectionTitle>{t("map.eventEntrance.destination")}</DatabaseSectionTitle>
      <ReferenceLinks links={[{
        id: destinationSummary.id, category: "dungeons", name: destinationSummary.name,
      }]} />
      {!!interiorTargets?.length && onOpenMap && <DungeonInteriorLinks targets={interiorTargets}
        labelKey={relatedInterior ? "mapInteriors.openRelatedInterior" : undefined} onOpenMap={onOpenMap} />}
      {eventArea && onOpenMap && <EventAreaLink target={eventArea} onOpenMap={onOpenMap} />}
    </section>}
    {!!bosses.length && destination && <section className="space-y-3">
      <DatabaseSectionTitle>{t("reference.labels.bosses")}</DatabaseSectionTitle>
      <DungeonCreatureList links={bosses} dungeonId={destination.id} bosses mapLinkIds={mapLinkIds}
        onShowMap={onOpenMap ? (boss) => {
          const location = bossLocations?.[boss.id];
          if (location) onOpenMap(location.mapId, location.markerId);
        } : undefined} />
    </section>}
    {!!rewards.length && <MapEventEntranceRewards sections={rewards} />}
    <ActivityOverview sections={overview} description={event.description} />
  </div>;
};

export default MapEventEntrance;
