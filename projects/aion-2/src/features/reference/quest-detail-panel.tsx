import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DetailTabs from "../../components/detail-tabs";
import DatabaseSectionTitle from "../database/database-section-title";
import { adventureFacts } from "./adventure-presentation";
import ReferenceSections, { ReferenceFacts, ReferenceLinks } from "./reference-sections";
import type { ReferenceEntry } from "./reference-types";
import { cn } from "../../lib/cn";
import { isInactiveQuestObjectiveText, isUnavailableQuestText, questDisplayObjectives,
  questObjectiveText } from "./quest-presentation";
import type { MapReferenceSearch } from "../map/map-focus-request";
import QuestLocationText from "./quest-location-text";
import { findQuestLocationName, questLocationTargets, questObjectiveReferenceLinks,
  questSourceMapTargets } from "./quest-location-targets";
import QuestSourceMapLinks from "./quest-source-map-links";
import { useQuestMapTargets } from "./use-quest-map-targets";
import { useQuestDungeonTargets } from "./use-quest-dungeon-targets";

const TABS = [
  { key: "objectives", label: "reference.labels.objectives" },
  { key: "rewards", label: "reference.dungeon.rewards" },
] as const;

const QuestDetailPanel = ({ entry, onOpenMap, compact = false }: { entry: ReferenceEntry; onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void; compact?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const id = useId();
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("objectives");
  const objectives = questDisplayObjectives(entry.sections.filter((section) => section.title === "reference.labels.objectives").flatMap((section) => section.rows ?? []));
  const incompleteText = isUnavailableQuestText(entry.name) || isUnavailableQuestText(entry.description)
    || objectives.some((objective) => isUnavailableQuestText(objective.description));
  const rewards = entry.sections.filter((section) => ["reference.labels.rewards", "reference.labels.choose-a-reward"].includes(section.title))
    .map((section) => ({ ...section, facts: adventureFacts(section.facts ?? [], t) }))
    .filter((section) => section.links?.length || section.facts.length || section.rows?.length);
  const prerequisiteFacts = adventureFacts(entry.facts, t);
  const hasPrerequisites = prerequisiteFacts.length > 0 || Boolean(entry.questRequirements?.length);
  const { regions: regionTargets, markers: mapMarkerTargets } = useQuestMapTargets(entry);
  const dungeonTargets = useQuestDungeonTargets(entry);
  const descriptionTargets = questLocationTargets(entry, [], regionTargets, undefined,
    mapMarkerTargets.filter((marker) => !marker.referenceId.startsWith("NpcData:")));
  return <>
    <DetailTabs id={id} label="reference.adventure.questSections" tabs={TABS} value={tab} onChange={setTab} />
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} className={cn(!compact && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
      <div className={cn("max-w-[808px] space-y-6", compact ? "py-4" : "px-5 py-5")}>
        {tab === "objectives" && <>
          {hasPrerequisites && <div className="@container">
            <div className="grid grid-cols-1 gap-4 @min-[640px]:grid-cols-2">
              <section className="min-w-0 space-y-4 rounded-[var(--radius-sm)] border border-border bg-surface p-4">
                <DatabaseSectionTitle>{t("reference.labels.prerequisites")}</DatabaseSectionTitle>
                <ReferenceFacts facts={prerequisiteFacts} />
                {!!entry.questRequirements?.length && <div className="space-y-3">
                  {entry.questRequirements.map((requirement, index) => <div key={index} className="space-y-2">
                    <p className="text-sm text-zinc-200">{t(requirement.label)}{requirement.value ? `: ${gameText(String(requirement.value))}` : ""}</p>
                    {requirement.link && <ReferenceLinks links={[requirement.link]} />}
                  </div>)}
                </div>}
              </section>
            </div>
          </div>}
          {entry.description && !isUnavailableQuestText(entry.description) && <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200"><QuestLocationText text={gameText(entry.description)} targets={descriptionTargets} onOpenMap={onOpenMap} /></p>}
          {incompleteText && <p className="text-xs leading-relaxed text-subtle">{t("reference.adventure.incompleteQuestText")}</p>}
          {entry.description?.includes("…") && !isUnavailableQuestText(entry.description) && <p className="text-xs text-subtle">{t("reference.dynamicValues")}</p>}
          <ul className="space-y-4">{objectives.map((objective, index) => {
            const text = questObjectiveText(objective, t, gameText);
            const stepNumber = /^(\d+)\s*·/.exec(objective.name)?.[1] ?? String(index + 1);
            const linkedNames = objective.links?.filter((link) => link.category !== "creatures" && link.category !== "dungeons"
              && text.toLowerCase().includes(gameText(link.name).toLowerCase()))
              .map((link) => gameText(link.name).toLowerCase()) ?? [];
            const targets = questLocationTargets(entry, objective.links, regionTargets, {
              step: Number(stepNumber), text,
            }, mapMarkerTargets, dungeonTargets).filter((target) =>
              target.referenceId || !linkedNames.some((name) => name.includes(gameText(target.name).toLowerCase())));
            const sourceTargets = isUnavailableQuestText(text) || isInactiveQuestObjectiveText(text) ? []
              : questSourceMapTargets(objective.links ?? [], mapMarkerTargets, { questId: entry.id, text }).filter((source) =>
                !targets.some((target) => target.referenceId === source.referenceId
                  && findQuestLocationName(text, gameText(target.name)) >= 0));
            const questReferences = questObjectiveReferenceLinks(text, objective.links ?? [], gameText);
            const requiredCountFacts = (objective.facts ?? []).filter((fact) =>
              fact.label === "reference.labels.required-count" && fact.value !== 0);
            return <li key={index} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{stepNumber}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-100"><QuestLocationText text={text} targets={targets} referenceTargets={questReferences.inline} onOpenMap={onOpenMap} /></p>
              {!!questReferences.additional.length && <ReferenceLinks links={questReferences.additional} compact />}
              {objective.facts?.some((fact) => fact.label === "reference.labels.optional" && fact.value === true) && <p className="text-xs text-subtle">{t("reference.labels.optional")}</p>}
              {(requiredCountFacts.length > 0 || sourceTargets.length > 0) && <div className={cn(
                "grid items-center gap-x-4 gap-y-2",
                requiredCountFacts.length > 0 && sourceTargets.length > 0
                  ? "grid-cols-[auto_1fr]" : "grid-cols-1",
              )}>
                <ReferenceFacts facts={requiredCountFacts} compact />
                <QuestSourceMapLinks targets={sourceTargets} onOpenMap={onOpenMap} />
              </div>}
            </div>
          </li>; })}</ul>
          {!objectives.length && <p className="text-sm text-subtle">{t("reference.adventure.noObjectives")}</p>}
          <ReferenceSections sections={entry.sections.filter((section) => ["reference.instanceLayer.questInstances", "reference.labels.previous-quest", "reference.labels.next-quest"].includes(section.title))} />
        </>}
        {tab === "rewards" && (rewards.length ? <ReferenceSections sections={rewards} /> : <p className="text-sm text-subtle">{t("reference.dungeon.noRewards")}</p>)}
      </div>
    </div>
  </>;
};
export default QuestDetailPanel;
