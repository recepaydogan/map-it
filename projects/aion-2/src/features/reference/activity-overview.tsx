import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DatabaseSectionTitle from "../database/database-section-title";
import ActivitySchedule from "./activity-schedule";
import ReferenceSections from "./reference-sections";
import type { ReferenceSection } from "./reference-types";

const ActivityOverview = ({ sections, description }: { sections: ReferenceSection[]; description?: string }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  return <div className="space-y-6">
    {sections.map((section, index) => {
      if (section.title === "reference.labels.rules" && section.text) {
        const rules = gameText(section.text).trim().split(/\r?\n\s*(?:[+•-]\s+|\d+[.)]\s+)/)
          .map((rule) => rule.replace(/^\s*(?:[+•-]\s+|\d+[.)]\s+)/, "").trim()).filter(Boolean);
        const remainder = { ...section, text: undefined };
        return <section key={index}>
          <DatabaseSectionTitle>{t("reference.activity.howToPlay")}</DatabaseSectionTitle>
          <ul className="divide-y divide-border/60">
            {rules.map((rule, ruleIndex) => <li key={ruleIndex} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <p className="whitespace-pre-line text-sm font-normal leading-6 text-zinc-200">{rule}</p>
            </li>)}
          </ul>
          {Boolean(section.facts?.length || section.links?.length || section.rows?.length || section.summary || section.summaryNotice) && <div className="mt-4"><ReferenceSections sections={[remainder]} hideTitles /></div>}
        </section>;
      }
      const scheduleLinks = section.title === "reference.labels.schedule"
        ? section.links?.filter((link) => link.id.startsWith("EventSchedule:")) ?? [] : [];
      if (scheduleLinks.length) {
        const remainder = { ...section, links: section.links?.filter((link) => !link.id.startsWith("EventSchedule:")) };
        return <div key={index} className="space-y-4">
          <ActivitySchedule links={scheduleLinks} />
          {Boolean(remainder.text || remainder.facts?.length || remainder.links?.length || remainder.rows?.length || remainder.summary || remainder.summaryNotice) &&
            <ReferenceSections sections={[remainder]} hideTitles />}
        </div>;
      }
      return <ReferenceSections key={index} sections={[section]} />;
    })}
    {description && <details className="group rounded-[var(--radius-sm)] border border-border px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-subtle focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        {t("reference.activity.story")}
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-3 whitespace-pre-line text-[13px] font-normal leading-6 text-subtle">{gameText(description)}</p>
    </details>}
  </div>;
};

export default ActivityOverview;
