import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import EquipmentSetPieces from "./equipment-set-pieces";
import ReferenceSections, { ReferenceFacts, ReferenceLinks } from "./reference-sections";
import type { ReferenceEntry, ReferenceRow, ReferenceSummary } from "./reference-types";
import { useReferenceEntries, useReferenceIndex } from "./use-reference-data";

const BonusDescriptions = ({ rows, summaries }: { rows: ReferenceRow[]; summaries: ReferenceSummary[] }) => {
  const { t } = useTranslation();
  const state = useReferenceEntries(summaries);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="text-[13px] text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const effects = new Map(state.data.map((entry) => [entry.id, entry]));
  return <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-surface">
    {rows.map((row, index) => <div key={`${row.name}-${index}`} className="space-y-2 px-4 py-4">
      <h4 className="text-[14px] font-semibold text-accent">{t("reference.sets.bonusCount", { pieces: row.name })}</h4>
      {row.description && <p className="text-[14px] leading-relaxed text-zinc-100">{row.description}</p>}
      {row.facts?.length ? <ReferenceFacts facts={row.facts} /> : null}
      {row.links?.map((link) => effects.get(link.id)?.description
        ? <p key={link.id} className="whitespace-pre-line text-[14px] leading-relaxed text-zinc-100">{effects.get(link.id)!.description}</p>
        : <ReferenceLinks key={link.id} links={[link]} />)}
    </div>)}
  </div>;
};

const EquipmentSetPanel = ({ entry }: { entry: ReferenceEntry }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  const pieces = entry.sections.filter((section) => section.title === "reference.labels.set-pieces").flatMap((section) => section.links ?? []);
  const bonuses = entry.sections.filter((section) => section.title === "reference.labels.set-bonuses").flatMap((section) => section.rows ?? []);
  const effectIds = new Set(bonuses.flatMap((row) => row.links ?? []).map((link) => link.id));
  const otherSections = entry.sections.filter((section) => !["reference.labels.set-pieces", "reference.labels.set-bonuses"].includes(section.title));
  return <div className="space-y-7">
    <section className="space-y-3">
      <DatabaseSectionTitle>{t("reference.labels.set-bonuses")}</DatabaseSectionTitle>
      <p className="text-[13px] leading-relaxed text-subtle">{t("reference.sets.bonusesHint")}</p>
      {index.status === "ready" ? <BonusDescriptions rows={bonuses} summaries={index.data.entries.filter((summary) => effectIds.has(summary.id))} />
        : <p role={index.status === "error" ? "alert" : "status"} className="text-[13px] text-subtle">{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>}
    </section>
    <EquipmentSetPieces links={pieces} />
    {otherSections.length > 0 && <ReferenceSections sections={otherSections} />}
  </div>;
};

export default EquipmentSetPanel;
