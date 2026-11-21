import { useTranslation } from "react-i18next";
import DungeonCombatMechanics from "./dungeon-combat-mechanics";
import AdventureRewards from "./adventure-rewards";
import FirstKillTitles from "./first-kill-titles";
import ReferenceLocations from "./reference-locations";
import WorldBossSchedule from "./world-boss-schedule";
import CombatTimers from "../intelligence/combat-timers";
import MapCompanionRewards from "../map/map-companion-rewards";
import MapCitizenAvailability from "../map/map-citizen-availability";
import ReferenceSections from "./reference-sections";
import type { MapCompanionSource } from "../map/map-companion-sources";
import type { DungeonMechanic, ReferenceEntry } from "./reference-types";
import { useCompanionSources } from "./use-reference-data";
import CreatureCombatAbilities from "./creature-combat-abilities";
import CreatureDungeonContexts from "./creature-dungeon-contexts";
import ResurrectionService from "./resurrection-service";

const CreatureContent = ({ entry, mechanics = [], showDrops = true, showDescription = true, excludeDropItems, showLocations = false, onOpenMap, companionSources, currentDungeonId }: {
  entry: ReferenceEntry; mechanics?: DungeonMechanic[]; showDrops?: boolean; showDescription?: boolean; excludeDropItems?: Set<string>;
  showLocations?: boolean; onOpenMap?: (mapId: string, markerId: string) => void; companionSources?: MapCompanionSource[]; currentDungeonId?: string;
}) => {
  const { t } = useTranslation();
  const companions = useCompanionSources(companionSources === undefined);
  const souls = companionSources ?? (companions.status === "ready" ? companions.data.sources[entry.id] ?? [] : []);
  const excludedDrops = new Set([...(excludeDropItems ?? []), ...souls.map(({ soul }) => soul.id)]);
  const defenses = [...mechanics, ...(entry.combatGuide?.defenses ?? []).filter((defense) =>
    !mechanics.some((known) => known.name === defense.name && JSON.stringify(known.stats) === JSON.stringify(defense.stats)))];
  return <div className="space-y-6">
    <WorldBossSchedule entry={entry} />
    <CombatTimers id={entry.id} />
    {(entry.group !== "Citizen" || !onOpenMap || !entry.id.startsWith("NpcData:")) && showDescription && entry.description
      && !(entry.group === "Boss" && entry.worldBoss?.length) &&
      <p className="text-[13px] leading-relaxed text-subtle">{entry.description}</p>}
    {entry.group === "Citizen" && onOpenMap && entry.id.startsWith("NpcData:") &&
      <MapCitizenAvailability npcId={entry.id.slice("NpcData:".length)} name={entry.name} onOpenMap={onOpenMap} />}
    {entry.id.startsWith("NpcData:") && entry.facts.some((fact) =>
      fact.label === "reference.labels.service" && fact.value === "Resurrection") &&
      <ResurrectionService npcId={entry.id.slice("NpcData:".length)} />}
    {entry.group === "Citizen" && <ReferenceSections sections={entry.sections.filter((section) => section.title === "reference.adventure.relatedQuests")} />}
    {entry.group === "Monster" && <CreatureCombatAbilities abilities={entry.combatGuide?.abilities ?? []} />}
    {!!defenses.length && <DungeonCombatMechanics mechanics={defenses} />}
    {entry.group === "Monster" && <CreatureDungeonContexts contexts={entry.dungeonContexts ?? []} currentDungeonId={currentDungeonId} />}
    <MapCompanionRewards sources={souls} />
    {companionSources === undefined && companions.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {showDrops && <AdventureRewards sections={entry.sections} excludeItems={excludedDrops} />}
    {showDrops && <FirstKillTitles titles={entry.sections.find((section) => section.title === "reference.loot.firstKillTitle")?.links ?? []} />}
    {showLocations && onOpenMap && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
  </div>;
};
export default CreatureContent;
