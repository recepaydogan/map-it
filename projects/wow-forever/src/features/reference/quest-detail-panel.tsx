import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import DetailTabs from "../../components/detail-tabs";
import DatabaseSectionTitle from "../database/database-section-title";
import { adventureFacts } from "./adventure-presentation";
import ReferenceLocations from "./reference-locations";
import ReferenceSections, { ReferenceFacts, ReferenceLinks } from "./reference-sections";
import type { ReferenceEntry } from "./reference-types";
import { cn } from "../../lib/cn";
import QuestDetailsSections from "./quest-details-sections";

const TABS = [
  { key: "objectives", label: "reference.labels.objectives" },
  { key: "rewards", label: "reference.dungeon.rewards" },
  { key: "requirements", label: "reference.labels.prerequisites" },
] as const;

const QuestDetailPanel = ({ entry, onOpenMap, compact = false }: { entry: ReferenceEntry; onOpenMap: (mapId: string, markerId: string) => void; compact?: boolean }) => {
  const { t } = useTranslation();
  const id = useId();
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("objectives");
  const objectives = entry.sections.filter((section) => section.title === "reference.labels.objectives").flatMap((section) => section.rows ?? []);
  const rewards = entry.sections.filter((section) => ["reference.labels.rewards", "reference.labels.choose-a-reward"].includes(section.title))
    .map((section) => ({ ...section, facts: adventureFacts(section.facts ?? [], t) }))
    .filter((section) => section.links?.length || section.facts.length || section.rows?.length);
  return <>
    <DetailTabs id={id} label="reference.adventure.questSections" tabs={TABS} value={tab} onChange={setTab} />
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} className={cn(!compact && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
      <div className={cn("max-w-[808px] space-y-6", compact ? "py-4" : "px-5 py-5")}>
        {tab === "objectives" && <>
          {entry.description && <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{entry.description}</p>}
          {entry.description?.includes("…") && <p className="text-xs text-subtle">{t("reference.dynamicValues")}</p>}
          <ol className="space-y-4">{objectives.map((objective, index) => <li key={index} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{index + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-100">{objective.description || t("reference.adventure.objective", { number: index + 1 })}</p>
              {objective.facts?.some((fact) => fact.label === "reference.labels.optional" && fact.value === true) && <p className="text-xs text-subtle">{t("reference.labels.optional")}</p>}
              <ReferenceFacts facts={(objective.facts ?? []).filter((fact) => fact.label === "reference.labels.required-count")} />
              {objective.links?.length ? <ReferenceLinks links={objective.links} /> : null}
            </div>
          </li>)}</ol>
          {!objectives.length && <p className="text-sm text-subtle">{t("reference.adventure.noObjectives")}</p>}
          {!compact && entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
          <ReferenceSections sections={entry.sections.filter((section) => ["reference.instanceLayer.questInstances", "reference.labels.previous-quest", "reference.labels.next-quest"].includes(section.title))} />
        </>}
        {tab === "rewards" && (rewards.length ? <ReferenceSections sections={rewards} /> : <p className="text-sm text-subtle">{t("reference.dungeon.noRewards")}</p>)}
        {tab === "requirements" && <>
          <QuestDetailsSections questId={entry.id} showHeading={false} />
          <ReferenceFacts facts={adventureFacts(entry.facts, t)} />
          {!!entry.questRequirements?.length && <section className="space-y-3"><DatabaseSectionTitle>{t("reference.labels.prerequisites")}</DatabaseSectionTitle>
            {entry.questRequirements.map((requirement, index) => <div key={index} className="space-y-2"><p className="text-sm text-zinc-200">{t(requirement.label)}{requirement.value ? `: ${requirement.value}` : ""}</p>{requirement.link && <ReferenceLinks links={[requirement.link]} />}</div>)}
          </section>}
        </>}
      </div>
    </div>
  </>;
};
export default QuestDetailPanel;
