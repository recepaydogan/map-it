import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import ReferenceSections from "./reference-sections";
import type { ReferenceSection } from "./reference-types";

const ActivityRewards = ({ sections, graded = false }: { sections: ReferenceSection[]; graded?: boolean }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const ranges = [...new Set(sections.flatMap((section) => section.rows?.map((row) => row.name) ?? []))];
  const [range, setRange] = useState(() => sections.flatMap((section) => section.rows ?? []).find((row) => row.links?.length)?.name ?? ranges[0] ?? "");
  if (!sections.length) return <p className="text-sm leading-6 text-subtle">{t("reference.activity.noRewards")}</p>;
  const filtered = sections.map((section) => ({ ...section,
    facts: graded ? section.facts?.filter((fact) => fact.label !== "reference.labels.reward-grade") : section.facts,
    text: section.showRewardRates ? t("reference.activity.ratesNotice") : section.text,
    links: section.links?.filter((link) => link.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
    rows: section.rows?.filter((row) => row.name === range).map((row) => ({ ...row,
      name: graded ? t("reference.activity.gradeNumber", { number: row.name }) : row.name,
      facts: graded ? row.facts?.filter((fact) => fact.label !== "reference.labels.reward-grade") : row.facts,
      links: row.links?.filter((link) => link.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
    })).filter((row) => row.links?.length || row.facts?.length || row.description),
  })).filter((section) => section.links?.length || section.rows?.length || section.facts?.length);
  return <div className="mr-auto w-full space-y-5 text-left">
    <div className="flex flex-wrap gap-3">
      {ranges.length > 0 && <label className="flex w-48 max-w-full flex-col gap-2 text-xs text-subtle">{t(graded ? "reference.activity.rewardGrade" : "reference.activity.rewardLevel")}
        <CategoryDropdown ariaLabel={t(graded ? "reference.activity.rewardGrade" : "reference.activity.rewardLevel")} value={range} onChange={setRange} triggerClassName="min-h-10"
          options={ranges.map((name) => ({ key: name, label: graded ? t("reference.activity.gradeNumber", { number: name }) : name }))} />
      </label>}
      <label className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-subtle">{t("reference.activity.findReward")}<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-white" /></label>
    </div>
    {filtered.length ? <ReferenceSections sections={filtered} activityRewardRates /> : <p className="text-sm text-subtle">{t(query.trim() ? "database.noMatches" : "reference.activity.noLevelRewards")}</p>}
  </div>;
};

export default ActivityRewards;
