import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACHIEVEMENT_OBJECTIVE_CONTEXT, ITEM_GRADE_TEXT_KEYS } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceLocations from "./reference-locations";
import ReferenceSections, { ReferenceLinks } from "./reference-sections";
import type { ReferenceEntry } from "./reference-types";

const factValue = (facts: ReferenceEntry["facts"], label: string) => facts.find((fact) => fact.label === label)?.value;

const AchievementDetailPanel = ({ entry, onOpenMap }: { entry: ReferenceEntry; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const id = useId();
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const grade = factValue(entry.facts, "reference.labels.grade");
  const resetCycle = factValue(entry.facts, "reference.labels.reset-cycle");
  const milestoneSections = entry.sections.filter((section) => section.title === "reference.labels.milestones");
  const objectiveSections = entry.sections.filter((section) => section.title === "reference.labels.objectives");
  const otherSections = entry.sections.filter((section) => !["reference.labels.milestones", "reference.labels.objectives"].includes(section.title));
  const milestones = milestoneSections.flatMap((section) => section.rows ?? []);
  const objective = ACHIEVEMENT_OBJECTIVE_CONTEXT[entry.id];
  const hasObjectiveSection = objectiveSections.length > 0;
  const hasMilestoneText = milestones.some((row) => !/^\d+$/.test(row.name.trim()));
  const selectedIndex = Math.min(milestoneIndex, milestones.length - 1);
  const milestone = milestones[selectedIndex];
  const count = milestone && factValue(milestone.facts ?? [], "reference.labels.required-count");
  const points = milestone && factValue(milestone.facts ?? [], "reference.labels.reward-points");
  const formattedCount = typeof count === "number" ? count.toLocaleString(i18n.language)
    : count === undefined ? gameText(milestone?.name ?? "") : gameText(String(count));
  const stepText = milestone && !/^\d+$/.test(milestone.name.trim()) ? milestone.name : null;
  const action = objective?.kind === "sealed-dungeon-clear" ? t("reference.achievement.clearCount", { count: formattedCount })
    : objective?.kind === "object-open" ? t("reference.achievement.openCount", { count: formattedCount, target: gameText(objective.target) })
      : t("reference.achievement.targetCount", { count: formattedCount });
  const overview = [
    objective?.kind === "sealed-dungeon-clear" && { label: t("reference.achievement.region"), value: gameText(objective.region) },
    grade && { label: t("reference.labels.grade"), value: gameText(String(grade), ITEM_GRADE_TEXT_KEYS[String(grade)]) },
    resetCycle && { label: t("reference.labels.reset-cycle"), value: resetCycle === "None" ? t("reference.achievement.noReset") : gameText(String(resetCycle)) },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return <div className="ml-0 mr-auto max-w-[808px] space-y-5 px-4 py-4 sm:px-6">
    {overview.length > 0 && <dl className="divide-y divide-border/50">{overview.map((fact) => <div key={fact.label} className="flex justify-between gap-6 py-1.5 text-[13px]">
      <dt className="text-zinc-400">{fact.label}</dt><dd className="text-right text-zinc-100">{fact.value}</dd>
    </div>)}</dl>}
    {entry.description && <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{gameText(entry.description)}</p>}
    {objectiveSections.length > 0 && <ReferenceSections sections={objectiveSections} />}
    {milestone && <div className="space-y-5">
      <section aria-labelledby={`${id}-milestones`} className="@container space-y-3">
        <DatabaseSectionTitle className="mb-0"><span id={`${id}-milestones`}>{t("reference.labels.milestones")}</span></DatabaseSectionTitle>
        {milestones.length > 1 ? <CategoryDropdown ariaLabel={t("reference.labels.milestones")} value={String(selectedIndex)} onChange={(value) => setMilestoneIndex(Number(value))} triggerClassName="@min-[540px]:w-[calc(50%-3px)]"
          options={milestones.map((_, index) => ({ key: String(index), label: t("reference.achievement.stage", { number: index + 1 }) }))} />
          : <p className="text-[13px] text-zinc-100">{t("reference.achievement.stage", { number: 1 })}</p>}
      </section>
      <section className="space-y-2">
        <DatabaseSectionTitle className="mb-0">{t("reference.achievement.task")}</DatabaseSectionTitle>
        <p className="text-[13px] leading-relaxed text-zinc-200">{milestone.description ? gameText(milestone.description) : action}</p>
        {!objective && !entry.description && !hasObjectiveSection && !hasMilestoneText && !milestone.description && <p className="text-xs leading-relaxed text-subtle">{t("reference.achievement.objectiveUnknown")}</p>}
        {stepText && stepText !== entry.name && <p className="text-[12px] leading-relaxed text-zinc-300">{gameText(stepText)}</p>}
      </section>
      {(!!milestone.links?.length || (typeof points === "number" && points > 0)) && <section className="space-y-3">
          <DatabaseSectionTitle className="mb-0">{t("reference.achievement.rewardLabel")}</DatabaseSectionTitle>
          {typeof points === "number" && points > 0 && <p className="text-[13px] text-zinc-200">{t("reference.achievement.points", { count: points })}</p>}
          {!!milestone.links?.length && <ReferenceLinks links={milestone.links} />}
      </section>}
    </div>}
    {otherSections.length > 0 && <ReferenceSections sections={otherSections} />}
    {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
  </div>;
};

export default AchievementDetailPanel;
