import { getItemDisplayName } from "../../lib/item-display-name";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { ReferenceFacts } from "../reference/reference-sections";
import type { ReferenceEntry, ReferenceFact, ReferenceLink, ReferenceRow, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import ItemIcon from "./item-icon";
import ItemTransferChances from "./item-transfer-chances";
import UpgradeCalculator from "../intelligence/upgrade-calculator";
import { getUpgradeOptions, type UpgradeOption } from "./item-upgrade-options";

const prefix = "database.upgradePanel";

// A zero-probability row without any cost is a terminal level, not a free attempt.
const isTerminalStage = (row: ReferenceRow | undefined) => Boolean(row
  && !row.links?.length
  && row.facts?.some((fact) => fact.label === "reference.labels.success-chance" && fact.value === 0)
  && row.facts?.some((fact) => fact.label === "reference.labels.currency-cost" && fact.value === 0));

const UpgradeResult = ({ entry, option, transferLinks }: { entry: ReferenceEntry; option: UpgradeOption; transferLinks: ReferenceLink[] }) => {
  const { t, i18n } = useTranslation();
  const openReference = useReferenceNavigation();
  const [selectedStage, setSelectedStage] = useState(0);
  const reset = option.operation === "reset";
  const binding = option.operation === "binding";
  const transfer = option.operation === "transfer";
  const rows = entry.sections.find((section) => section.title === (binding
    ? "reference.labels.binding-costs" : "reference.labels.upgrade-steps"))?.rows ?? [];
  const stage = rows[selectedStage] ?? rows[0];
  const materials = reset
    ? entry.sections.find((section) => section.title === "reference.labels.reroll-materials")?.links ?? []
    : stage?.links ?? [];
  const currency = entry.facts.filter((fact) => fact.label === "reference.labels.currency");
  const facts: ReferenceFact[] = reset ? entry.facts : [...(stage?.facts ?? []),
    ...((stage?.facts ?? []).some((fact) => fact.label === "reference.labels.currency") ? [] : currency)];
  const terminal = !binding && !reset && !transfer && isTerminalStage(stage);
  const stageLabel = (row: ReferenceRow) => {
    const name = row.name;
    const level = Number(name.replace(/^\+/, ""));
    if (binding) return t(`${prefix}.bindingStage`, { level: name });
    if (transfer) return t(`${prefix}.transferCount`, { count: level });
    if (isTerminalStage(row)) return t(`${prefix}.maximumStage`, { level });
    return Number.isFinite(level) ? t(`${prefix}.levelChange`, { from: level, to: level + 1 }) : name;
  };
  const formatFact = (fact: ReferenceFact): ReferenceFact => [
    "reference.labels.success-chance", "reference.labels.failure-correction",
  ].includes(fact.label) && typeof fact.value === "number"
    ? { ...fact, value: `${fact.value.toLocaleString(i18n.language)}%` } : fact;

  return <>
    {!reset && rows.length > 1 && <div className="min-w-0">
      <DatabaseSectionTitle>{t(`${prefix}.${binding ? "stage" : transfer ? "transfers" : "level"}`)}</DatabaseSectionTitle>
      <CategoryDropdown value={String(selectedStage)}
        onChange={(value) => setSelectedStage(Number(value))}
        ariaLabel={t(`${prefix}.${binding ? "stage" : transfer ? "transfers" : "level"}`)}
        options={rows.map((row, index) => ({ key: String(index), label: stageLabel(row) }))}
        triggerClassName="py-2.5 pr-4" />
    </div>}
    <div className="col-span-full space-y-4 rounded-[var(--radius-md)] border border-border bg-white/[0.025] p-4" aria-live="polite">
      {terminal ? <p className="text-[13px] text-zinc-200">{t(`${prefix}.maximumLevel`)}</p> : <>
        {facts.length > 0 && <ReferenceFacts facts={facts.map(formatFact)} />}
        {transfer && transferLinks.length > 0 && <ItemTransferChances links={transferLinks} count={Number(stage?.name.replace(/^\+/, ""))} />}
        {materials.length > 0 && <section>
          <DatabaseSectionTitle>{t(`${prefix}.materials`)}</DatabaseSectionTitle>
          <div className="space-y-1.5">{materials.map((material, index) => <button key={`${material.id}-${index}`} type="button"
            onClick={() => openReference(material)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left hover:border-accent/50 hover:bg-accent-soft">
            <ItemIcon icon={material.icon} name={getItemDisplayName(material.name)} size={30} />
            <span className="min-w-0 flex-1 text-[13px] text-zinc-100">{getItemDisplayName(material.name)}</span>
            {material.quantity !== undefined && <span className="shrink-0 text-[13px] tabular-nums text-zinc-300">×{material.quantity.toLocaleString(i18n.language)}</span>}
          </button>)}</div>
        </section>}
        {facts.length === 0 && materials.length === 0 && <p className="text-xs text-muted">{t("database.noSectionData")}</p>}
      </>}
    </div>
    {!binding && !reset && !transfer && <UpgradeCalculator groupId={entry.id} />}
  </>;
};

const UpgradeEntry = ({ summary, option, transferLinks }: { summary: ReferenceSummary; option: UpgradeOption; transferLinks: ReferenceLink[] }) => {
  const { t } = useTranslation();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="col-span-full text-xs text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <UpgradeResult entry={state.data} option={option} transferLinks={transferLinks} />;
};

const ItemUpgradePanel = ({ links, transferLinks = [] }: { links: ReferenceLink[]; transferLinks?: ReferenceLink[] }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState("");
  const index = useReferenceIndex();
  const options = getUpgradeOptions(links);
  const current = options.find((option) => option.id === selectedId) ?? options[0];
  if (!current) return null;
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === current.link.id) : undefined;
  return <section className="grid max-w-[760px] grid-cols-2 items-start gap-4">
    <div className={cn("min-w-0", current.operation === "reset" && "col-span-full")}>
      <DatabaseSectionTitle>{t(`${prefix}.operation`)}</DatabaseSectionTitle>
      <CategoryDropdown value={current.id} onChange={setSelectedId}
        ariaLabel={t(`${prefix}.operation`)}
        options={options.map((option) => ({ key: option.id, label: t(`${prefix}.operations.${option.operation}`) }))}
        triggerClassName="py-2.5 pr-4" />
    </div>
    {summary ? <UpgradeEntry key={current.id} summary={summary} option={current} transferLinks={transferLinks} />
      : <p className="col-span-full text-xs text-muted" role={index.status === "loading" ? "status" : "alert"}>{t(index.status === "loading" ? "reference.loading" : "reference.error")}</p>}
  </section>;
};

export default ItemUpgradePanel;
