import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceLocations from "./reference-locations";
import ReferenceMapLinks from "./reference-map-links";
import ReferenceFactBadges from "./reference-fact-badges";
import type { ReferenceEntry } from "./reference-types";
import { adventureFacts } from "./adventure-presentation";
import DungeonCreatureList from "./dungeon-creature-list";
import DungeonContentsPanel from "./dungeon-contents-panel";
import AdventureRewards from "./adventure-rewards";
import AdventureLinkList from "./adventure-link-list";
import DungeonObjectives from "./dungeon-objectives";
import DungeonInteriorLinks from "./dungeon-interior-links";
import EventAreaLink from "./event-area-link";
import InstanceLayerDetails from "./instance-layer-details";
import GuildHallDetails from "./guild-hall-details";
import DungeonBossGuide from "./dungeon-boss-guide";
import DungeonQuestGuide from "./dungeon-quest-guide";
import DungeonSecretBossGuide from "./dungeon-secret-boss-guide";
import type { MapInstanceFacts } from "../map/types";
import { hasUsefulInstanceMapLink } from "../map/instance-map-link";

const DungeonDetailPanel = ({ entry, onOpenMap, compact = false, instanceFacts, instanceEncounters }: {
  entry: ReferenceEntry; compact?: boolean;
  instanceFacts?: MapInstanceFacts; instanceEncounters?: { id: number; nameKey: string }[];
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const bosses = entry.sections.filter((section) => ["reference.labels.bosses", "reference.labels.boss"].includes(section.title))
    .flatMap((section) => section.links ?? []);
  const requirements = adventureFacts(entry.sections.filter((section) => section.title === "reference.labels.entry-requirements")
    .flatMap((section) => section.facts ?? []), t);
  const facts = adventureFacts(entry.facts, t);
  const factLabels = new Set(facts.map((fact) => fact.label));
  const displayedFacts = [...facts];
  if (instanceFacts?.minimumEntryLevel !== undefined && !factLabels.has("map.instanceFacts.minimumEntryLevel")) {
    displayedFacts.push({ label: "map.instanceFacts.minimumEntryLevel", value: instanceFacts.minimumEntryLevel });
  }
  if (instanceFacts?.groupSize !== undefined && !factLabels.has("map.instanceFacts.groupSize")) {
    displayedFacts.push({ label: "map.instanceFacts.groupSize", value: instanceFacts.groupSize });
  }
  const formattedFacts = displayedFacts.map((fact) => fact.label === "map.instanceFacts.minimumEntryLevel"
    ? { ...fact, value: `${fact.value}+` }
    : fact.label === "map.instanceFacts.groupSize"
      ? { ...fact, value: t("map.instanceFacts.playerCount", { count: Number(fact.value) }) } : fact);
  const tickets = entry.sections.filter((section) => section.title === "reference.labels.entry-tickets")
    .flatMap((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]);
  return <div className={cn(!compact && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
    <div className={cn("max-w-[808px] space-y-6", compact ? "pb-4" : "px-6 py-5")}>
      {!entry.guildHall && <ReferenceFactBadges facts={[...formattedFacts, ...requirements]} layout="grid" />}
      {hasUsefulInstanceMapLink(entry.id) && !!entry.interiorMaps?.length && <DungeonInteriorLinks targets={entry.interiorMaps} onOpenMap={onOpenMap} />}
      {!!entry.mapLinks?.length && <ReferenceMapLinks groups={entry.mapLinks} onOpenMap={onOpenMap} />}
      {!!entry.relatedInteriorMaps?.length && <DungeonInteriorLinks targets={entry.relatedInteriorMaps}
        labelKey="mapInteriors.openRelatedInterior" onOpenMap={onOpenMap} />}
      {(!compact || !bosses.length || entry.id === "mapgenie-instance-949847") && <DungeonBossGuide dungeonId={entry.id}
        encounters={entry.instanceEncounters?.length ? entry.instanceEncounters : instanceEncounters} compact={compact} />}
      {entry.id === "mapgenie-instance-949849" && <DungeonSecretBossGuide onOpenMap={onOpenMap} />}
      <DungeonQuestGuide dungeonId={entry.id} />
      {entry.eventArea && <EventAreaLink target={entry.eventArea} onOpenMap={onOpenMap} />}
      {entry.guildHall && <GuildHallDetails details={entry.guildHall} />}
      {entry.instanceLayer && <InstanceLayerDetails details={entry.instanceLayer} />}
      {entry.chestGuide && <DungeonObjectives guide={entry.chestGuide} />}
      {!!bosses.length && entry.id !== "mapgenie-instance-949847" && <section>
        <DatabaseSectionTitle count={new Set(bosses.map((boss) => boss.name)).size}>{t("reference.labels.bosses")}</DatabaseSectionTitle>
        <DungeonCreatureList links={bosses} dungeonId={entry.id} bosses />
        {entry.dungeonBosses?.source === "challenge-table" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.challengePoolNotice")}</p>}
        {entry.dungeonBosses?.source === "rewards" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.rewardBossNotice")}</p>}
      </section>}
      <AdventureRewards sections={entry.sections} />
      <DungeonContentsPanel contents={entry.dungeonContents} dungeonId={entry.id} />
      {!!tickets.length && <section><DatabaseSectionTitle>{t("reference.labels.entry-tickets")}</DatabaseSectionTitle><AdventureLinkList links={tickets} /></section>}
      {!compact && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
    </div>
  </div>;
};
export default DungeonDetailPanel;
