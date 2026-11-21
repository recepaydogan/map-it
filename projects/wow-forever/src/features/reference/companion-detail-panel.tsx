import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceOverview from "./reference-overview";
import ReferenceSections from "./reference-sections";
import type { CompanionProgression } from "./companion-types";
import type { ReferenceEntry } from "./reference-types";
import { useCompanionProgression } from "./use-reference-data";
import CompanionSources from "../intelligence/companion-sources";

const CompanionProgress = ({ entry, data }: { entry: ReferenceEntry; data: CompanionProgression }) => {
  const { t, i18n } = useTranslation();
  const [insightLevel, setInsightLevel] = useState(1);
  const pet = data.pets[entry.id];
  const genus = pet && data.genera[pet.genus];
  if (!pet || !genus) return <p role="alert" className="text-sm text-subtle">{t("reference.error")}</p>;
  const growth = pet.statGroup ? data.statGroups[pet.statGroup] ?? [] : [];
  const labels = [...new Set(growth.flatMap((row) => row.stats.map((stat) => stat.label)))];
  const progression = growth.map((row) => ({ ...row, costs: data.levels.find((level) => level.level === row.level) }));
  const insight = genus.levels.find((row) => row.level === insightLevel) ?? genus.levels[0];
  const number = (value: number) => value.toLocaleString(i18n.language);
  const cell = "px-3 py-2.5 text-right tabular-nums";
  return <>
    {progression.length > 0 && <section className="space-y-3">
      <DatabaseSectionTitle>{t("reference.companions.petLevels")}</DatabaseSectionTitle>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border">
        <table className="w-full text-[12px]">
          <caption className="sr-only">{t("reference.companions.petLevels")}</caption>
          <thead className="bg-surface text-subtle"><tr>
            <th scope="col" className={cell}>{t("reference.companions.level")}</th>
            {labels.map((label) => <th key={label} scope="col" className={cell}>{t(label)}</th>)}
            <th scope="col" className={cell}>{t("reference.companions.soulsToNext")}</th>
            <th scope="col" className={cell}>{t("reference.companions.genusExperience")}</th>
          </tr></thead>
          <tbody className="divide-y divide-border">{progression.map((row) => <tr key={row.level}>
            <th scope="row" className="px-3 py-3 text-right font-semibold text-accent">{row.level}</th>
            {labels.map((label) => <td key={label} className={cell}>{row.stats.find((stat) => stat.label === label)?.value ?? t("reference.companions.noBonus")}</td>)}
            <td className={cell}>{!row.costs ? t("reference.companions.noBonus") : row.costs.soulsToNextLevel ? number(row.costs.soulsToNextLevel) : t("reference.companions.maxLevel")}</td>
            <td className={cell}>{row.costs ? number(row.costs.genusExperience) : t("reference.companions.noBonus")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
    <section className="@container space-y-4">
      <DatabaseSectionTitle>{t("reference.companions.genusInsight", { genus: genus.name })}</DatabaseSectionTitle>
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-zinc-200">
        <span>{t("reference.companions.selectInsight")}</span>
        <div className="w-48">
          <CategoryDropdown
            ariaLabel={t("reference.companions.selectInsight")}
            value={String(insight.level)}
            onChange={(value) => setInsightLevel(Number(value))}
            options={genus.levels.map((row) => ({ key: String(row.level), label: t("reference.companions.levelValue", { level: row.level }) }))}
          />
        </div>
      </div>
      <dl className="grid gap-3 text-[13px] @min-[360px]:grid-cols-2">{[
        ["experienceToNext", insight.experienceToNextLevel ? number(insight.experienceToNextLevel) : t("reference.companions.maxLevel")],
        ["openSlots", number(genus.slotLevels.filter((level) => level <= insight.level).length)],
        ["analysisExperience", number(insight.analysisExperience)],
        ["analysisCost", t("reference.companions.costValue", { crystals: number(genus.analysisCrystals), currency: number(genus.analysisCurrency) })],
      ].map(([key, val]) => <div key={key} className="rounded-[var(--radius-sm)] border border-border bg-surface p-3"><dt className="text-xs text-subtle">{t(`reference.companions.${key}`)}</dt><dd className="mt-1 font-medium text-white">{val}</dd></div>)}</dl>
      <div className="space-y-2">
        <h4 className="text-[13px] font-medium text-zinc-200">{t("reference.companions.gradeChances")}</h4>
        <dl className="grid gap-2 @min-[360px]:grid-cols-2 @min-[540px]:grid-cols-3">{insight.grades.filter((grade) => grade.percent > 0).map((grade) => <div key={grade.grade} className="flex justify-between gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-xs"><dt className="min-w-0 text-subtle [overflow-wrap:anywhere]">{t(`reference.companions.grades.${grade.grade}`)}</dt><dd className="tabular-nums text-accent">{number(grade.percent)}%</dd></div>)}</dl>
      </div>
    </section>
  </>;
};

const CompanionDetailPanel = ({ entry, onOpenMap }: { entry: ReferenceEntry; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t } = useTranslation();
  const state = useCompanionProgression();
  const speedLabels = {
    "reference.labels.run-speed-table-units": "reference.companions.runSpeed",
    "reference.labels.sprint-speed-table-units": "reference.companions.sprintSpeed",
  };
  const speedFacts = Object.entries(speedLabels).flatMap(([sourceLabel, label]) => {
    const fact = entry.facts.find((fact) => fact.label === sourceLabel);
    return fact ? [{ ...fact, label }] : [];
  });
  const overview = {
    ...entry,
    description: undefined,
    facts: [...speedFacts, ...entry.facts.filter((fact) => !Object.hasOwn(speedLabels, fact.label))],
  };
  return <div className="space-y-7">
    <ReferenceOverview entry={overview} onOpenMap={onOpenMap} />
    <CompanionSources id={entry.id} />
    {state.status === "ready" ? <CompanionProgress entry={entry} data={state.data} /> : <p role={state.status === "error" ? "alert" : "status"} className="text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>}
    <ReferenceSections sections={entry.sections.filter((section) => section.title !== "reference.labels.growth-bonuses")} />
  </div>;
};

export default CompanionDetailPanel;
