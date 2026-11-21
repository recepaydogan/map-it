import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { requestMapPointInMain, requestMapReferenceInMain } from "../map/map-window-bridge";
import type { MapReferenceSearch } from "../map/map-focus-request";
import ReferenceLocations from "./reference-locations";
import ReferenceSections, { ReferenceFacts } from "./reference-sections";
import type { ReferenceEntry, ReferenceLink } from "./reference-types";
import CreatureContent from "./creature-content";
import FieldEventEntranceContent from "./field-event-entrance-content";
import WorldObjectContent from "./world-object-content";
import type { MapCompanionSource } from "../map/map-companion-sources";

const FACTS = new Set(["reference.labels.level", "reference.labels.grade", "reference.labels.required-level", "reference.labels.required-combat-power", "reference.labels.required-mastery", "reference.labels.one-time-reward"]);

const openMapLocation = (mapId: string, markerId: string, search?: MapReferenceSearch) => {
  if (search) requestMapReferenceInMain(search.referenceId, search.name, mapId, search.region, markerId, search.allRegions);
  else requestMapPointInMain(markerId, mapId, undefined, true);
};

const WorldEntryContent = ({ entry, showLocations = false, showDrops = true, showDescription = true, showFacts = true, showDungeonContexts = true, showCombatAbilities = true, showCombatAbilityList = true, excludeDropItems, companionSources, objectVariants }: {
  entry: ReferenceEntry; showLocations?: boolean; showDrops?: boolean; showDescription?: boolean; showFacts?: boolean; showDungeonContexts?: boolean; showCombatAbilities?: boolean; showCombatAbilityList?: boolean; excludeDropItems?: Set<string>; companionSources?: MapCompanionSource[]; objectVariants?: ReferenceEntry[];
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  if (entry.fieldEvent) return <div className="space-y-5"><FieldEventEntranceContent npcId={entry.id.slice("NpcData:".length)} activityId={entry.fieldEvent.activityId}
    onOpenMap={(mapId, markerId) => requestMapPointInMain(markerId, mapId, undefined, true)} />
    {showLocations && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={openMapLocation} creature={entry.category === "creatures" ? { id: entry.id, name: entry.name } : undefined} />}</div>;
  if (entry.category === "creatures") return <CreatureContent entry={entry} showLocations={showLocations} showDrops={showDrops} showDescription={showDescription} showDungeonContexts={showDungeonContexts} showCombatAbilities={showCombatAbilities} showCombatAbilityList={showCombatAbilityList}
    excludeDropItems={excludeDropItems} companionSources={companionSources} onOpenMap={openMapLocation} />;
  const facts = entry.facts.filter((fact) => FACTS.has(fact.label) && fact.value !== 0 && fact.value !== false && fact.value !== "None"
    && !(entry.rewardObject?.access && fact.label === "reference.labels.one-time-reward"));
  const sections = entry.sections.filter((section) => section.title !== "reference.labels.schedule"
    && !(entry.rewardObject && section.title === "reference.labels.possible-rewards")
    && section.title !== "reference.labels.skills"
    && (showDrops || !["reference.labels.possible-drops", "reference.labels.guaranteed-drops"].includes(section.title)))
    .map((section) => {
      const drops = ["reference.labels.possible-drops", "reference.labels.guaranteed-drops"].includes(section.title);
      const keep = (link: ReferenceLink) => !["schedules", "activities", "travel"].includes(link.category)
        && !(drops && excludeDropItems?.has(link.id));
      return { ...section, links: section.links?.filter(keep), rows: section.rows?.map((row) => ({ ...row, links: row.links?.filter(keep) }))
        .filter((row) => row.links?.length || row.description || row.facts?.length || row.location) };
    })
    .filter((section) => section.links?.length || section.rows?.length || section.tierCards?.tiers.length || section.facts?.length || section.text || section.summary || section.summaryNotice);
  const skills = entry.sections.filter((section) => section.title === "reference.labels.skills");
  return <div className="space-y-4">
    {entry.rewardObject && <WorldObjectContent key={entry.id} entry={entry} variants={objectVariants} />}
    {showDescription && !entry.rewardObject && entry.description && <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{gameText(entry.description)}</p>}
    {showFacts && !!facts.length && <ReferenceFacts facts={facts} />}
    {showLocations && (entry.locations.length ? <ReferenceLocations locations={entry.locations} onOpenMap={(mapId, markerId) => requestMapPointInMain(markerId, mapId, undefined, true)} />
      : <p className="text-xs text-subtle">{t("reference.adventure.noLocation")}</p>)}
    <ReferenceSections sections={sections} />
    {!!skills.length && <details className="rounded-[var(--radius-sm)] border border-border p-3"><summary className="cursor-pointer text-sm text-zinc-200">{t("reference.labels.skills")}</summary><div className="mt-3"><ReferenceSections sections={skills} hideTitles /></div></details>}
  </div>;
};
export default WorldEntryContent;
