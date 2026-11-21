import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import SearchField from "../../components/search-field";
import ReferenceSections from "./reference-sections";
import type { ReferenceSection } from "./reference-types";

const REWARD_FILTER_THRESHOLD = 25;

const ActivityRewards = ({ sections, graded = false }: { sections: ReferenceSection[]; graded?: boolean }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [query, setQuery] = useState("");
  const ranges = [...new Set(sections.flatMap((section) => section.rows?.map((row) => row.name) ?? []))];
  const [range, setRange] = useState(() => sections.flatMap((section) => section.rows ?? []).find((row) => row.links?.length)?.name ?? ranges[0] ?? "");
  if (!sections.length) return <p className="text-sm leading-6 text-subtle">{t("reference.activity.noRewards")}</p>;
  const rewardCount = sections.reduce((count, section) => count + (section.links?.length ?? 0)
    + (section.rows?.reduce((rowCount, row) => rowCount + (row.links?.length ?? 0), 0) ?? 0), 0);
  const showSearch = rewardCount > REWARD_FILTER_THRESHOLD;
  const showRange = showSearch && ranges.length > 1;
  const searchQuery = showSearch ? query.trim().toLocaleLowerCase() : "";
  const filtered = sections.map((section) => ({ ...section,
    facts: graded ? section.facts?.filter((fact) => fact.label !== "reference.labels.reward-grade") : section.facts,
    text: section.showRewardRates ? t("reference.activity.ratesNotice") : section.text,
    links: section.links?.filter((link) => `${link.name} ${gameText(link.name)}`.toLocaleLowerCase().includes(searchQuery)),
    rows: section.rows?.filter((row) => !showRange || row.name === range).map((row) => ({ ...row,
      name: graded ? t("reference.activity.gradeNumber", { number: row.name })
        : /^\d+[–-]\d+$/.test(row.name) ? t("reference.activity.rewardLevelRange", { range: row.name }) : row.name,
      facts: graded ? row.facts?.filter((fact) => fact.label !== "reference.labels.reward-grade") : row.facts,
      links: row.links?.filter((link) => `${link.name} ${gameText(link.name)}`.toLocaleLowerCase().includes(searchQuery)),
    })).filter((row) => row.links?.length || row.facts?.length || row.description),
  })).filter((section) => section.links?.length || section.rows?.length || section.facts?.length);
  return <div className="mr-auto w-full space-y-5 text-left">
    {(showRange || showSearch) && <div className="flex flex-wrap gap-3">
      {showRange && <label className="flex w-48 max-w-full flex-col gap-2 text-xs text-subtle">{t(graded ? "reference.activity.rewardGrade" : "reference.activity.rewardLevel")}
        <CategoryDropdown ariaLabel={t(graded ? "reference.activity.rewardGrade" : "reference.activity.rewardLevel")} value={range} onChange={setRange} triggerClassName="min-h-10"
          options={ranges.map((name) => ({ key: name, label: graded ? t("reference.activity.gradeNumber", { number: name }) : gameText(name) }))} />
      </label>}
      {showSearch && <SearchField value={query} onChange={setQuery} label={t("reference.activity.findReward")}
        className="min-w-0 flex-1 basis-[220px] self-end" />}
    </div>}
    {filtered.length ? <ReferenceSections sections={filtered} activityRewardRates initialCount={showSearch ? undefined : REWARD_FILTER_THRESHOLD} />
      : <p className="text-sm text-subtle">{t(searchQuery ? "database.noMatches" : "reference.activity.noLevelRewards")}</p>}
  </div>;
};

export default ActivityRewards;
