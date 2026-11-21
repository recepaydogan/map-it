import { useId } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { ReferenceFacts, ReferenceLinks } from "../reference/reference-sections";
import type { ReferenceSection, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import type { DatabaseItem } from "./item-database-types";

const DismantlingResults = ({ summary, level }: { summary: ReferenceSummary; level: number }) => {
  const { t } = useTranslation();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="text-xs text-muted" role={state.status === "error" ? "alert" : "status"}>
    {t(state.status === "error" ? "reference.error" : "reference.loading")}
  </p>;
  const results = state.data.sections.flatMap((section) => section.rows ?? []).filter((row) => row.name === `+${level}`);
  const links = results.flatMap((row) => row.links ?? []);
  return links.length > 0 ? <ReferenceLinks links={links} showRewardRates />
    : <p className="text-xs text-muted">{t("database.dismantlingPanel.noResults")}</p>;
};

const ItemDismantlingPanel = ({ item, sections, level, onLevelChange, allowed }: {
  item: DatabaseItem;
  sections: ReferenceSection[];
  level: number;
  onLevelChange: (level: number) => void;
  allowed?: boolean;
}) => {
  const { t } = useTranslation();
  const levelId = useId();
  const index = useReferenceIndex();
  if (allowed === false) return <p className="text-[13px] text-muted">{t("database.dismantlingPanel.unavailable")}</p>;
  const links = sections.flatMap((section) => section.links ?? []);
  const packages = [...new Map(links.map((link) => [link.id, link])).values()];
  const facts = sections.flatMap((section) => section.facts ?? []);
  const levels = [...new Set([0, ...item.enhancements.map((enhancement) => enhancement.level)])].sort((a, b) => a - b);

  return <div className="@container max-w-[760px] space-y-5">
    <div className="grid items-end gap-4 @min-[480px]:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <label htmlFor={levelId} className="block text-[12px] text-muted">{t("database.enhancementLevel")}</label>
        <CategoryDropdown id={levelId} value={String(level)} onChange={(value) => onLevelChange(Number(value))}
          ariaLabel={t("database.enhancementLevel")} triggerClassName="py-2.5 pr-4"
          options={levels.map((value) => ({ key: String(value), label: `+${value}` }))} />
      </div>
      {facts.length > 0 && <div className="rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-4 py-1">
        <ReferenceFacts facts={facts} />
      </div>}
    </div>
    <section className="space-y-3" aria-live="polite">
      <DatabaseSectionTitle>{t("reference.labels.possible-dismantling-results")}</DatabaseSectionTitle>
      {packages.map((link, position) => {
        const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === link.id) : undefined;
        return <div key={link.id} className="space-y-2">
          {packages.length > 1 && <h4 className="text-[13px] font-semibold text-zinc-300">{t("database.dismantlingPanel.resultGroup", { number: position + 1 })}</h4>}
          {summary ? <DismantlingResults summary={summary} level={level} />
            : <p className="text-xs text-muted" role={index.status === "loading" ? "status" : "alert"}>
              {t(index.status === "loading" ? "reference.loading" : "reference.error")}
            </p>}
        </div>;
      })}
      {packages.length === 0 && <p className="text-xs text-muted">{t("database.noSectionData")}</p>}
      {packages.length > 0 && <p className="text-[11px] leading-relaxed text-muted">{t("database.dismantlingPanel.possibleNotice")}</p>}
    </section>
  </div>;
};

export default ItemDismantlingPanel;
