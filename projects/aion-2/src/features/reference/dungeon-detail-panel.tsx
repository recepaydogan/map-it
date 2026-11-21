import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceLocations from "./reference-locations";
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
import { navigableReferenceLocations, ReferenceLocationContext } from "./reference-location-context";
import { CURRENT_DUNGEON_RULES } from "../../game-config";

const DungeonDetailPanel = ({ entry, onOpenMap, compact = false }: {
  entry: ReferenceEntry; compact?: boolean;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const currentRules = CURRENT_DUNGEON_RULES[entry.id];
  const bosses = entry.sections.filter((section) => ["reference.labels.bosses", "reference.labels.boss"].includes(section.title))
    .flatMap((section) => section.links ?? []);
  const requirements = adventureFacts(entry.sections.filter((section) => section.title === "reference.labels.entry-requirements")
    .flatMap((section) => section.facts ?? []), t);
  const facts = adventureFacts(entry.facts, t);
  const tickets = entry.sections.filter((section) => section.title === "reference.labels.entry-tickets")
    .flatMap((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]);
  const currentLocation = useContext(ReferenceLocationContext);
  const entranceLocations = navigableReferenceLocations(entry.locations, currentLocation);
  const hasInteriorMaps = !!entry.interiorMaps?.length || !!entry.relatedInteriorMaps?.length;
  const interiorLinks = <>
    {!!entry.interiorMaps?.length && <DungeonInteriorLinks targets={entry.interiorMaps} onOpenMap={onOpenMap} />}
    {!!entry.relatedInteriorMaps?.length && <DungeonInteriorLinks targets={entry.relatedInteriorMaps}
      labelKey="mapInteriors.openRelatedInterior" onOpenMap={onOpenMap} />}
  </>;
  return <div className={cn(!compact && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
    <div className={cn("max-w-[1200px] space-y-6", compact ? "pb-4" : "px-6 py-5")}>
      {!entry.guildHall && <ReferenceFactBadges facts={[...facts, ...requirements]} layout="grid" />}
      {currentRules && <section className="space-y-1 rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft px-3 py-2 text-xs leading-5 text-zinc-200">
        <p>{t("reference.adventure.hardExpeditionRules", { minutes: currentRules.frenzyMinutes, revives: currentRules.revivesPerPlayer })}</p>
        <p>{t("updates.gamePatch.expeditionRewards")}</p>
      </section>}
      {compact && interiorLinks}
      {!compact && (hasInteriorMaps || entranceLocations.length > 0) && <section>
        <DatabaseSectionTitle>{t("reference.adventure.mapsAndEntrances")}</DatabaseSectionTitle>
        <div className={cn("grid items-start gap-3", hasInteriorMaps && entranceLocations.length > 0 && "sm:grid-cols-2")}>
          {hasInteriorMaps && <div className="min-w-0 space-y-2">{interiorLinks}</div>}
          {entranceLocations.length > 0 && <ReferenceLocations locations={entranceLocations} onOpenMap={onOpenMap} embedded />}
        </div>
      </section>}
      {entry.eventArea && <EventAreaLink target={entry.eventArea} onOpenMap={onOpenMap} />}
      {entry.guildHall && <GuildHallDetails details={entry.guildHall} />}
      {entry.instanceLayer && <InstanceLayerDetails details={entry.instanceLayer} />}
      {entry.chestGuide && <DungeonObjectives guide={entry.chestGuide} />}
      {!!bosses.length && <section>
        <DatabaseSectionTitle count={new Set(bosses.map((boss) => boss.name)).size}>{t("reference.labels.bosses")}</DatabaseSectionTitle>
        <DungeonCreatureList links={bosses} dungeonId={entry.id} bosses />
        {entry.dungeonBosses?.source === "challenge-table" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.challengePoolNotice")}</p>}
        {entry.dungeonBosses?.source === "rewards" && <p className="mt-2 text-xs leading-relaxed text-subtle">{t("reference.adventure.rewardBossNotice")}</p>}
      </section>}
      <AdventureRewards sections={entry.sections} />
      <DungeonContentsPanel contents={entry.dungeonContents} dungeonId={entry.id} />
      {!!tickets.length && <section><DatabaseSectionTitle>{t("reference.labels.entry-tickets")}</DatabaseSectionTitle><AdventureLinkList links={tickets} /></section>}
    </div>
  </div>;
};
export default DungeonDetailPanel;
