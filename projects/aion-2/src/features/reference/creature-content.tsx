import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DungeonCombatMechanics from "./dungeon-combat-mechanics";
import AdventureRewards from "./adventure-rewards";
import FirstKillTitles from "./first-kill-titles";
import ReferenceLocations from "./reference-locations";
import WorldBossSchedule from "./world-boss-schedule";
import CombatTimers from "../intelligence/combat-timers";
import MapCompanionRewards from "../map/map-companion-rewards";
import MapCitizenAvailability from "../map/map-citizen-availability";
import type { MapCompanionSource } from "../map/map-companion-sources";
import type { MapReferenceSearch } from "../map/map-focus-request";
import type { DungeonMechanic, ReferenceEntry } from "./reference-types";
import { useBossPanelData, useCompanionSources } from "./use-reference-data";
import CreatureDungeonContexts from "./creature-dungeon-contexts";
import ResurrectionService from "./resurrection-service";
import BossEncounterFacts from "./boss-encounter-facts";
import CreatureCombatAbilities from "./creature-combat-abilities";

const CreatureContent = ({ entry, mechanics = [], showDrops = true, showDescription = true, showDungeonContexts = true, showCombatAbilities = true, showCombatAbilityList = true, excludeDropItems, showLocations = false, onOpenMap, companionSources, currentDungeonId }: {
  entry: ReferenceEntry; mechanics?: DungeonMechanic[]; showDrops?: boolean; showDescription?: boolean; excludeDropItems?: Set<string>;
  showDungeonContexts?: boolean; showCombatAbilities?: boolean; showCombatAbilityList?: boolean; showLocations?: boolean; onOpenMap?: (mapId: string, markerId: string, search?: MapReferenceSearch) => void; companionSources?: MapCompanionSource[]; currentDungeonId?: string;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const companions = useCompanionSources(companionSources === undefined);
  const bossPanel = useBossPanelData(showCombatAbilities && entry.id.startsWith("NpcData:"));
  const bossFacts = bossPanel.status === "ready" ? bossPanel.data.entries[entry.id] : undefined;
  const souls = companionSources ?? (companions.status === "ready" ? companions.data.sources[entry.id] ?? [] : []);
  const excludedDrops = new Set([...(excludeDropItems ?? []), ...souls.map(({ soul }) => soul.id)]);
  const defenses = [...mechanics, ...(entry.combatGuide?.defenses ?? []).filter((defense) =>
    !mechanics.some((known) => known.name === defense.name && JSON.stringify(known.stats) === JSON.stringify(defense.stats)))];
  return <div className="space-y-6">
    <WorldBossSchedule entry={entry} />
    <CombatTimers id={entry.id} />
    {(entry.group !== "Citizen" || !onOpenMap || !entry.id.startsWith("NpcData:")) && showDescription && entry.description
      && !(entry.group === "Boss" && entry.worldBoss?.length) &&
      <p className="text-[13px] leading-relaxed text-subtle">{gameText(entry.description)}</p>}
    {entry.group === "Citizen" && onOpenMap && entry.id.startsWith("NpcData:") &&
      <MapCitizenAvailability npcId={entry.id.slice("NpcData:".length)} name={entry.name}
        relatedQuests={entry.sections.find((section) => section.title === "reference.adventure.relatedQuests")?.links ?? []} />}
    {entry.id.startsWith("NpcData:") && entry.facts.some((fact) =>
      fact.label === "reference.labels.service" && fact.value === "Resurrection") &&
      <ResurrectionService npcId={entry.id.slice("NpcData:".length)} />}
    {!!defenses.length && <DungeonCombatMechanics mechanics={defenses} />}
    {showCombatAbilities && <BossEncounterFacts facts={bossFacts} />}
    {showCombatAbilities && bossPanel.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {showDungeonContexts && entry.group === "Monster" && <CreatureDungeonContexts contexts={entry.dungeonContexts ?? []} currentDungeonId={currentDungeonId} />}
    <MapCompanionRewards sources={souls} />
    {companionSources === undefined && companions.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
    {showDrops && <AdventureRewards sections={entry.sections} excludeItems={excludedDrops} />}
    {showDrops && <FirstKillTitles titles={entry.sections.find((section) => section.title === "reference.loot.firstKillTitle")?.links ?? []} />}
    {showLocations && onOpenMap && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} creature={{ id: entry.id, name: entry.name }} />}
    {showCombatAbilities && showCombatAbilityList && bossFacts && <CreatureCombatAbilities abilities={entry.combatGuide?.abilities ?? []} icon={bossFacts.skillIcon} />}
  </div>;
};
export default CreatureContent;
