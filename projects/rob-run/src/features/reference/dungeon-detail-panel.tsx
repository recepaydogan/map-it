import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import DetailTabs from "../../components/detail-tabs";
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
import DungeonPreparation from "./dungeon-preparation";
import type { MapInstanceFacts } from "../map/types";
import { hasUsefulInstanceMapLink } from "../map/instance-map-link";
import { dungeonLevelRange } from "./dungeon-journal";
import DungeonMapViewer from "../map/dungeon-map-viewer";
import { getDungeonMap } from "../map/dungeon-maps";

const overviewTabs = [
  { key: "overview", label: "dungeonJournal.beforeYouGo" },
] as const;
const dungeonTabs = [...overviewTabs, { key: "map", label: "dungeonJournal.map" }] as const;

const DungeonDetailPanel = ({ entry, onOpenMap, compact = false, instanceFacts, instanceEncounters }: {
  entry: ReferenceEntry; compact?: boolean;
  instanceFacts?: MapInstanceFacts; instanceEncounters?: { id: number; nameKey: string }[];
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const tabsId = useId();
  const [selectedTab, setTab] = useState<(typeof dungeonTabs)[number]["key"]>("overview");
  const dungeonMap = getDungeonMap(entry.id);
  const tab = dungeonMap ? selectedTab : "overview";
  const bosses = entry.sections.filter((section) => ["reference.labels.bosses", "reference.labels.boss"].includes(section.title))
    .flatMap((section) => section.links ?? []);
  const requirements = adventureFacts(entry.sections.filter((section) => section.title === "reference.labels.entry-requirements")
    .flatMap((section) => section.facts ?? []), t);
  const levelRange = dungeonLevelRange(entry.id);
  const facts = adventureFacts(entry.facts, t).filter((fact) => !levelRange
    || !["map.instanceFacts.betaAvailable", "map.instanceFacts.betaLevelRange"].includes(fact.label));
  const factLabels = new Set(facts.map((fact) => fact.label));
  const displayedFacts = [...facts];
  if (levelRange) displayedFacts.unshift({ label: "dungeonJournal.suggestedLevels", value: levelRange });
  if (instanceFacts?.minimumEntryLevel !== undefined && !factLabels.has("map.instanceFacts.minimumEntryLevel")) {
    displayedFacts.push({ label: "map.instanceFacts.minimumEntryLevel", value: instanceFacts.minimumEntryLevel });
  }
  const groupSize = instanceFacts?.groupSize ?? entry.adventure?.partySize
    ?? (entry.adventure?.kind === "party" ? 5 : undefined);
  if (groupSize !== undefined && !factLabels.has("map.instanceFacts.groupSize")) {
    displayedFacts.push({ label: "map.instanceFacts.groupSize", value: groupSize });
  }
  const formattedFacts = displayedFacts.map((fact) => fact.label === "map.instanceFacts.minimumEntryLevel"
    ? { ...fact, value: `${fact.value}+` }
    : fact.label === "map.instanceFacts.groupSize"
      ? { ...fact, value: t("map.instanceFacts.playerCount", { count: Number(fact.value) }) } : fact);
  const tickets = entry.sections.filter((section) => section.title === "reference.labels.entry-tickets")
    .flatMap((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]);
  const overview = <>
      {!entry.guildHall && <ReferenceFactBadges facts={[...formattedFacts, ...requirements]} layout="grid" />}
      {entry.id === "mapgenie-instance-949849" && <p className="rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-300">{t("reference.dalaranAccessNote")}</p>}
      <DungeonPreparation dungeonId={entry.id} compact={compact} />
      {hasUsefulInstanceMapLink(entry.id) && !!entry.interiorMaps?.length && <DungeonInteriorLinks targets={entry.interiorMaps} onOpenMap={onOpenMap} />}
      {!!entry.mapLinks?.length && <ReferenceMapLinks groups={entry.mapLinks} onOpenMap={onOpenMap} />}
      {!!entry.relatedInteriorMaps?.length && <DungeonInteriorLinks targets={entry.relatedInteriorMaps}
        labelKey="mapInteriors.openRelatedInterior" onOpenMap={onOpenMap} />}
      {entry.eventArea && <EventAreaLink target={entry.eventArea} onOpenMap={onOpenMap} />}
      {entry.guildHall && <GuildHallDetails details={entry.guildHall} />}
      {entry.instanceLayer && <InstanceLayerDetails details={entry.instanceLayer} />}
      {!!tickets.length && <section><DatabaseSectionTitle>{t("reference.labels.entry-tickets")}</DatabaseSectionTitle><AdventureLinkList links={tickets} /></section>}
      {!compact && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
  </>;
  const bossGuide = (!compact || !bosses.length || entry.id === "mapgenie-instance-949847") && <DungeonBossGuide dungeonId={entry.id}
    encounters={entry.instanceEncounters?.length ? entry.instanceEncounters : instanceEncounters}
    compact={compact} />;
  const encounters = <>
      {!!entry.chestGuide?.steps.length && <DungeonObjectives guide={entry.chestGuide} />}
      {!!bosses.length && entry.id !== "mapgenie-instance-949847" && <section>
        <DatabaseSectionTitle count={new Set(bosses.map((boss) => boss.name)).size}>{t("reference.labels.bosses")}</DatabaseSectionTitle>
        <DungeonCreatureList links={bosses} dungeonId={entry.id} bosses />
        {entry.dungeonBosses?.source === "challenge-table" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.challengePoolNotice")}</p>}
        {entry.dungeonBosses?.source === "rewards" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.rewardBossNotice")}</p>}
      </section>}
      <AdventureRewards sections={entry.sections} />
      <DungeonContentsPanel contents={entry.dungeonContents} dungeonId={entry.id} />
  </>;
  const beforeYouGo = <>
    {overview}
    {bossGuide}
    {encounters}
    <DungeonQuestGuide key={entry.id} dungeonId={entry.id} />
    {entry.id === "mapgenie-instance-949849" && <DungeonSecretBossGuide onOpenMap={onOpenMap} />}
  </>;
  if (compact) return <div className="max-w-[808px] space-y-6 pb-4">{beforeYouGo}</div>;
  return <>
    <div className="me-[var(--dungeon-side-inset,0px)] shrink-0 [&_[aria-selected=true]]:text-accent">
      <DetailTabs id={tabsId} label="reference.categories.dungeons"
        tabs={dungeonMap ? dungeonTabs : overviewTabs} value={tab} onChange={setTab} />
    </div>
    <div key={tab} id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}
      className="scroll-slim me-[var(--dungeon-side-inset,0px)] min-h-0 flex-1 overflow-y-auto">
      <div className="max-w-[808px] space-y-6 px-6 py-5">
        {tab === "overview" && beforeYouGo}
        {tab === "map" && dungeonMap && <DungeonMapViewer key={entry.id} map={dungeonMap}
          onOpenMap={(mapId) => onOpenMap(mapId, "")} className="h-[min(65vh,680px)] min-h-80" />}
      </div>
    </div>
  </>;
};
export default DungeonDetailPanel;
