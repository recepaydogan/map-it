import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { formatDropChance } from "../../lib/format-drop-chance";
import type { ReferenceLink, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";

const ChanceResult = ({ summary, count }: { summary: ReferenceSummary; count?: number }) => {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [selected, setSelected] = useState("0");
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="text-xs text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const rows = state.data.sections.find((section) => section.title === "reference.labels.success-rates")?.rows ?? [];
  const current = count === undefined ? selected : String(count);
  const row = rows.find((row) => row.name === current);
  const chance = row?.facts?.find((fact) => fact.label === "reference.labels.success-chance")?.value;
  return <>
    {count === undefined && <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[12px] text-muted">{t("database.upgradePanel.transfers")}</label>
      <CategoryDropdown id={id} ariaLabel={t("database.upgradePanel.transfers")} value={current} onChange={setSelected}
        options={rows.map((row) => ({ key: row.name, label: t("database.upgradePanel.transferCount", { count: Number(row.name) }) }))} triggerClassName="py-2.5 pr-4" />
    </div>}
    <p className="col-span-full text-[13px] text-zinc-100" aria-live="polite">{typeof chance === "number"
      ? t("database.transferChances.result", { chance: formatDropChance(chance, i18n.language) })
      : t("database.transferChances.unavailable")}</p>
  </>;
};

const ItemTransferChances = ({ links, count }: { links: ReferenceLink[]; count?: number }) => {
  const { t } = useTranslation();
  const id = useId();
  const [selected, setSelected] = useState("");
  const index = useReferenceIndex();
  const ordered = [...links].sort((a, b) => Number(b.id.endsWith("::Common")) - Number(a.id.endsWith("::Common")));
  const current = ordered.find((link) => link.id === selected) ?? ordered[0];
  if (!current) return null;
  const summary = index.status === "ready" ? index.data.entries.find((entry) => entry.id === current.id) : undefined;
  return <section className="max-w-[760px] space-y-3">
    <DatabaseSectionTitle>{t("reference.labels.transfer-chances")}</DatabaseSectionTitle>
    <div className="grid items-start gap-4 @min-[480px]:grid-cols-2">
      <div className="space-y-1.5"><label htmlFor={id} className="block text-[12px] text-muted">{t("database.transferChances.mode")}</label>
        <CategoryDropdown id={id} ariaLabel={t("database.transferChances.mode")} value={current.id} onChange={setSelected}
          options={ordered.map((link) => ({ key: link.id, label: t(link.id.endsWith("::Common") ? "database.transferChances.normal" : "database.transferChances.advanced") }))} triggerClassName="py-2.5 pr-4" />
      </div>
      {summary ? <ChanceResult key={current.id} summary={summary} count={count} />
        : <p className="text-xs text-muted" role={index.status === "loading" ? "status" : "alert"}>{t(index.status === "loading" ? "reference.loading" : "reference.error")}</p>}
    </div>
  </section>;
};

export default ItemTransferChances;
